// 권리자 인증 시도 저장·실행·결과 판정. 결과 반영은 platform/ownershipVerification.js.
import { ACTIVITY_TYPES, recordActivity } from '../../platform/activityLog.js';
import { AppError } from '../../platform/AppError.js';
import { audit } from '../../platform/audit.js';
import { getNow } from '../../platform/dateUtils.js';
import { decryptField, encryptField } from '../../platform/fieldCrypto.js';
import { lockOwnershipRow } from '../../platform/ownershipLock.js';
import { applyOwnershipVerification, expireStaleAttempts, failAttemptInTx } from '../../platform/ownershipVerification.js';
import {
  ACTIVE_ATTEMPT_STATUSES,
  buildLedgerTarget,
  canStartInOrder,
  matchOwner,
  RENEWAL_WINDOW_DAYS,
  resolveIdentity,
} from '../../platform/ownershipVerificationRules.js';
import { prisma } from '../../platform/prismaClient.js';
import { toOwnershipResponse, toPropertySummary } from '../../platform/propertySerializer.js';
import { selectRunner as defaultSelectRunner } from './runners/index.js';

export const CONSENT_TYPE = 'OWNERSHIP_VERIFICATION';
export const CONSENT_VERSION = '2026-11-03';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// 임대인 응답. 다른 사람의 존재가 드러나지 않게 상세 사유·읽은 소유자 수를 넣지 않는다.
const toAttemptResponse = (attempt) => ({
  id: attempt.id,
  ownershipId: attempt.ownershipId,
  status: attempt.status,
  createdAt: attempt.createdAt.toISOString(),
  finishedAt: attempt.finishedAt?.toISOString() ?? null,
});

// 원문이 들어 있을 수 있어 메시지는 남기지 않는다.
const logFailure = (label, attemptId, error) => {
  console.error(`[ownership-verification] ${label}`, attemptId, error?.code ?? error?.name ?? 'unknown');
};

const failRunningAttempt = (attemptId, reasonCode, extra) =>
  prisma.$transaction((tx) => failAttemptInTx(tx, attemptId, 'RUNNING', reasonCode, extra));

const loadIdentity = async (attempt) => {
  const user = await prisma.user.findUnique({ where: { id: attempt.requestedBy }, select: { name: true } });
  // decryptField는 실패하면 null이다. 호출 쪽에서 INTERNAL로 구분한다.
  return resolveIdentity(user, { birthDate: decryptField(attempt.birthDateEnc) });
};

// 러너 결과 { kind, ledgerKind, owners } → 판정 → 반영. 늦은 결과는 버린다. 예외를 밖으로 내지 않는다(결과 원문 보호).
// 돌려주는 값: { accepted } — RUNNING 시도에 반영했는지.
export const receiveRunnerResult = async (attemptId, result, deps = {}) => {
  const ledgerKind = result.ledgerKind ?? null;
  const ownerCount = result.owners?.length ?? 0;
  const extra = { ledgerKind, ownerCount };
  try {
    if (result.kind !== 'OK') return { accepted: await failRunningAttempt(attemptId, result.kind, extra) };

    const attempt = await prisma.ownershipVerificationAttempt.findUnique({
      where: { id: attemptId },
      select: { status: true, requestedBy: true, birthDateEnc: true },
    });
    if (attempt?.status !== 'RUNNING') return { accepted: false };

    const identity = await loadIdentity(attempt);
    if (!identity.birthDate) return { accepted: await failRunningAttempt(attemptId, 'INTERNAL', extra) };

    const judged = matchOwner(identity, result.owners);
    if (judged !== 'VERIFIED') return { accepted: await failRunningAttempt(attemptId, judged, extra) };

    const applied = await applyOwnershipVerification({ attemptId, ledgerKind, ownerCount }, deps);
    return { accepted: applied.outcome !== 'IGNORED' };
  } catch (error) {
    logFailure('결과 반영 실패', attemptId, error);
    await failRunningAttempt(attemptId, 'INTERNAL', extra).catch((failure) => logFailure('실패 기록 실패', attemptId, failure));
    return { accepted: true };
  }
};

// PENDING → RUNNING으로 옮긴 쪽만 실행한다(0건이면 실행하지 않는다). 모든 예외를 잡아 FAILED로 끝낸다.
export const runAttempt = async (attemptId, runner, deps = {}) => {
  try {
    const { count } = await prisma.ownershipVerificationAttempt.updateMany({
      where: { id: attemptId, status: 'PENDING' },
      data: { status: 'RUNNING', updatedAt: getNow() },
    });
    if (count === 0) return;

    const attempt = await prisma.ownershipVerificationAttempt.findUnique({
      where: { id: attemptId },
      select: {
        requestedBy: true,
        birthDateEnc: true,
        ownership: { select: { property: { include: { complex: true } } } },
      },
    });
    const target = buildLedgerTarget(attempt.ownership.property);
    if (!target) {
      await failRunningAttempt(attemptId, 'NO_JIBUN_ADDRESS');
      return;
    }

    const result = await runner.run(target, { attemptId, getIdentity: () => loadIdentity(attempt) });
    if (result.kind !== 'DISPATCHED') await receiveRunnerResult(attemptId, result, deps);
  } catch (error) {
    logFailure('실행 실패', attemptId, error);
    await failRunningAttempt(attemptId, 'INTERNAL').catch((failure) => logFailure('실패 기록 실패', attemptId, failure));
  }
};

const findActiveAttempt = (client, ownershipId) =>
  client.ownershipVerificationAttempt.findFirst({ where: { ownershipId, status: { in: [...ACTIVE_ATTEMPT_STATUSES] } } });

const createAttemptInTx = async (tx, user, { ownershipId, birthDateEnc }, req) => {
  // 소유 종료·계약 쓰기와 같은 행 잠금으로 줄을 세운다. 이중 POST도 여기서 줄을 선다.
  const ownership = await lockOwnershipRow(tx, ownershipId);
  if (!ownership || ownership.userId !== user.id) throw new AppError('OWNERSHIP_NOT_FOUND', 404, '소유 관계를 찾을 수 없습니다.');
  if (ownership.endedAt) throw new AppError('OWNERSHIP_ENDED', 422, '이미 종료된 소유 관계입니다.');
  if (ownership.verificationStatus === 'REVOKED') {
    throw new AppError('VERIFICATION_REVOKED', 422, '인증이 취소된 소유 관계입니다. 관리자에게 문의해 주세요.');
  }

  const existing = await findActiveAttempt(tx, ownershipId);
  if (existing) return { attempt: existing, created: false };

  const now = getNow();
  const rows = await tx.ownership.findMany({
    where: { propertyId: ownership.propertyId, endedAt: null },
    select: { id: true, startedAt: true, verificationStatus: true, verificationExpiresAt: true },
  });
  const inOrder = canStartInOrder(rows, ownershipId, now);

  await tx.consent.create({
    data: { userId: user.id, type: CONSENT_TYPE, version: CONSENT_VERSION, agreed: true, agreedAt: now, ip: req?.ip ?? null },
  });
  const attempt = await tx.ownershipVerificationAttempt.create({
    data: { ownershipId, requestedBy: user.id, birthDateEnc: inOrder ? birthDateEnc : null },
  });

  const property = await tx.property.findUnique({
    where: { id: ownership.propertyId },
    select: { complexId: true, buildingNo: true, unitNo: true },
  });
  await audit.record({
    actor: user,
    action: 'OWNERSHIP_VERIFICATION_REQUESTED',
    resourceType: 'OWNERSHIP',
    resourceId: ownershipId,
    after: { attemptId: attempt.id, propertyId: ownership.propertyId },
    req,
    client: tx,
  });
  await recordActivity(tx, {
    userId: user.id,
    type: ACTIVITY_TYPES.OWNERSHIP_VERIFICATION_REQUESTED,
    complexId: property.complexId,
    propertyId: ownership.propertyId,
    params: { attemptId: attempt.id, buildingNo: property.buildingNo, unitNo: property.unitNo },
  });

  // 나중에 등록한 사람은 발급 없이 끝낸다.
  if (!inOrder) await failAttemptInTx(tx, attempt.id, 'PENDING', 'NOT_FIRST_REGISTRANT');
  return { attempt, created: inOrder };
};

// POST /ownership-verifications. 러너 확인 → 시도 저장 → 실행. 진행 중 시도가 있으면 그 시도를 돌려준다.
export const startOwnershipVerification = async (user, input, req, deps = {}) => {
  const { selectRunner = defaultSelectRunner, schedule = setImmediate } = deps;
  const runner = selectRunner();
  if (!runner) throw new AppError('VERIFICATION_RUNNER_UNAVAILABLE', 503, '권리자 인증을 준비 중입니다. 잠시 후 다시 시도해 주세요.');

  await expireStaleAttempts();

  const birthDateEnc = encryptField(resolveIdentity(user, input).birthDate);
  let outcome;
  try {
    outcome = await prisma.$transaction((tx) => createAttemptInTx(tx, user, { ownershipId: input.ownershipId, birthDateEnc }, req));
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const existing = await findActiveAttempt(prisma, input.ownershipId);
    if (!existing) throw error;
    outcome = { attempt: existing, created: false };
  }

  const attemptId = outcome.attempt.id;
  if (outcome.created) {
    if (runner.awaitDispatch) await runAttempt(attemptId, runner);
    else schedule(() => runAttempt(attemptId, runner));
  }
  return toAttemptResponse(await prisma.ownershipVerificationAttempt.findUnique({ where: { id: attemptId } }));
};

// GET /ownership-verifications/:attemptId. 본인 것만.
export const findAttemptForUser = async (user, attemptId) => {
  await expireStaleAttempts();
  const attempt = await prisma.ownershipVerificationAttempt.findFirst({ where: { id: attemptId, requestedBy: user.id } });
  if (!attempt) throw new AppError('OWNERSHIP_VERIFICATION_NOT_FOUND', 404, '인증 시도를 찾을 수 없습니다.');
  return toAttemptResponse(attempt);
};

// GET /ownership-verifications?ownershipId= 호실 상세의 진행 표시용. 내 시도 중 최신 1건, 없으면 null.
export const findLatestAttempt = async (user, ownershipId) => {
  await expireStaleAttempts();
  const attempt = await prisma.ownershipVerificationAttempt.findFirst({
    where: { ownershipId, requestedBy: user.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return attempt ? toAttemptResponse(attempt) : null;
};

// GET /ownership-verifications/renewal-targets. 만료 30일 이내·만료된 내 활성 소유 관계, 만료가 빠른 순.
export const findRenewalTargets = async (user, now = getNow()) => {
  const ownerships = await prisma.ownership.findMany({
    where: {
      userId: user.id,
      endedAt: null,
      verificationStatus: 'VERIFIED',
      verificationExpiresAt: { lte: new Date(now.getTime() + RENEWAL_WINDOW_DAYS * MS_PER_DAY) },
    },
    include: { property: { include: { complex: true } } },
    orderBy: [{ verificationExpiresAt: 'asc' }, { id: 'asc' }],
  });
  return ownerships.map((ownership) => toOwnershipResponse(ownership, toPropertySummary(ownership.property), now));
};
