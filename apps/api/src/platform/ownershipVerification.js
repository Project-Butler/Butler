// 권리자 인증 결과 반영(계약 9장 applyOwnershipVerification). 소유자 이름·번호·생년월일은 받지 않는다 — 판정은 호출 쪽이 끝낸다.
import { ACTIVITY_TYPES, recordActivity } from './activityLog.js';
import { audit } from './audit.js';
import { getNow } from './dateUtils.js';
import { endOwnershipInTx } from './ownershipEnd.js';
import { lockActiveOwnershipRows } from './ownershipLock.js';
import { computeOwnershipVerificationStatus } from './ownershipStatus.js';
import {
  ACTIVE_ATTEMPT_STATUSES,
  computeVerificationExpiry,
  DEFAULT_VALIDITY_YEARS,
  hasEarlierRevokedOwner,
  parseValidityYears,
  STALE_ATTEMPT_MS,
} from './ownershipVerificationRules.js';
import { prisma } from './prismaClient.js';

export const VALIDITY_SETTING_KEY = 'OWNERSHIP_VERIFICATION_VALIDITY_YEARS';
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };
const STALE_SWEEP_LIMIT = 200;

export const readValiditySetting = async (client = prisma) => {
  const row = await client.platformSetting.findUnique({ where: { key: VALIDITY_SETTING_KEY } });
  return { validityYears: parseValidityYears(row?.value) ?? DEFAULT_VALIDITY_YEARS, updatedAt: row?.updatedAt ?? null };
};

export const writeValiditySetting = (client, years) =>
  client.platformSetting.upsert({
    where: { key: VALIDITY_SETTING_KEY },
    create: { key: VALIDITY_SETTING_KEY, value: String(years) },
    update: { value: String(years) },
  });

// 시도를 끝내는 유일한 함수. 끝 상태 저장과 임시 생년월일 삭제가 같은 갱신이다. expectedStatus가 아니면 false.
// 회원 정보로 전환하면 birthDateEnc 줄을 뺀다(resolveIdentity 주석).
export const finishAttempt = async (tx, attemptId, expectedStatus, result) => {
  const now = getNow();
  const { count } = await tx.ownershipVerificationAttempt.updateMany({
    where: { id: attemptId, status: expectedStatus },
    data: {
      status: result.status,
      reasonCode: result.reasonCode ?? null,
      ledgerKind: result.ledgerKind ?? undefined,
      ownerCount: result.ownerCount ?? undefined,
      birthDateEnc: null,
      finishedAt: now,
      updatedAt: now,
    },
  });
  return count > 0;
};

const loadAttemptContext = (tx, attemptId) =>
  tx.ownershipVerificationAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      ownershipId: true,
      requestedBy: true,
      ownership: { select: { propertyId: true, property: { select: { complexId: true, buildingNo: true, unitNo: true } } } },
    },
  });

const toUnitParams = (property) => ({ buildingNo: property.buildingNo, unitNo: property.unitNo });

// 실패로 끝내고 감사(사유 포함)·활동(사유 없음)을 남긴다. 이미 끝났으면 false.
export const failAttemptInTx = async (tx, attemptId, expectedStatus, reasonCode, { ledgerKind, ownerCount } = {}) => {
  const finished = await finishAttempt(tx, attemptId, expectedStatus, { status: 'FAILED', reasonCode, ledgerKind, ownerCount });
  if (!finished) return false;

  const attempt = await loadAttemptContext(tx, attemptId);
  await audit.record({
    action: 'OWNERSHIP_VERIFICATION_FAILED',
    resourceType: 'OWNERSHIP',
    resourceId: attempt.ownershipId,
    summary: reasonCode,
    after: { attemptId, reasonCode },
    client: tx,
  });
  await recordActivity(tx, {
    userId: attempt.requestedBy,
    type: ACTIVITY_TYPES.OWNERSHIP_VERIFICATION_FAILED,
    complexId: attempt.ownership.property.complexId,
    propertyId: attempt.ownership.propertyId,
    params: { attemptId, ...toUnitParams(attempt.ownership.property) },
  });
  return true;
};

// 10분이 지난 진행 중 시도를 TIMED_OUT으로 끝낸다(전역). 조건 갱신이라 동시에 돌아도 한 번만 끝난다.
export const expireStaleAttempts = async ({ client = prisma, now = getNow() } = {}) => {
  const stale = await client.ownershipVerificationAttempt.findMany({
    where: { status: { in: [...ACTIVE_ATTEMPT_STATUSES] }, createdAt: { lt: new Date(now.getTime() - STALE_ATTEMPT_MS) } },
    select: { id: true, status: true },
    orderBy: { createdAt: 'asc' },
    take: STALE_SWEEP_LIMIT,
  });

  let expired = 0;
  for (const { id, status } of stale) {
    const finished = await client.$transaction((tx) => failAttemptInTx(tx, id, status, 'TIMED_OUT'));
    if (finished) expired += 1;
  }
  return expired;
};

const defaultSaveVerified = (tx, { ownershipId, attemptId, verifiedAt, expiresAt }) =>
  tx.ownership.update({
    where: { id: ownershipId },
    data: { verificationStatus: 'VERIFIED', verifiedAt, verificationExpiresAt: expiresAt, checkId: attemptId },
  });

const supersedeExpiredOwner = async (tx, row) => {
  const ended = await endOwnershipInTx(tx, row, { endReason: 'SUPERSEDED', note: null, checkActiveContracts: false });
  await audit.record({
    action: 'OWNERSHIP_ENDED',
    resourceType: 'OWNERSHIP',
    resourceId: row.id,
    summary: 'SUPERSEDED',
    after: { endReason: 'SUPERSEDED' },
    client: tx,
  });
  await recordActivity(tx, {
    userId: row.userId,
    type: ACTIVITY_TYPES.OWNERSHIP_ENDED,
    complexId: ended.property.complexId,
    propertyId: ended.propertyId,
    params: { ...toUnitParams(ended.property), endReason: 'SUPERSEDED' },
  });
};

const applyInTx = async (tx, { attemptId, ledgerKind, ownerCount, saveVerified }) => {
  const now = getNow();
  const fail = async (reasonCode) => {
    await failAttemptInTx(tx, attemptId, 'RUNNING', reasonCode, { ledgerKind, ownerCount });
    return { outcome: 'FAILED', reasonCode };
  };

  // 1. RUNNING일 때만 시각을 갱신해 시도 행을 잠근다. 0건이면 늦은 결과라 전부 버린다.
  const { count } = await tx.ownershipVerificationAttempt.updateMany({
    where: { id: attemptId, status: 'RUNNING' },
    data: { updatedAt: now },
  });
  if (count === 0) return { outcome: 'IGNORED' };
  const attempt = await loadAttemptContext(tx, attemptId);

  // 2. 호실의 활성 행을 id 순서로 잠근다.
  const rows = await lockActiveOwnershipRows(tx, attempt.ownership.propertyId);

  // 3. 내 행이 없거나 철회됐으면 실패.
  const mine = rows.find((row) => row.id === attempt.ownershipId);
  if (!mine || mine.verificationStatus === 'REVOKED') return fail('OWNERSHIP_CHANGED');

  // 4. 잠금 안에서 다른 행의 만료를 다시 계산한다.
  const others = rows.filter((row) => row.id !== mine.id);
  if (others.some((row) => computeOwnershipVerificationStatus(row, now) === 'VERIFIED')) return fail('VERIFIED_OWNER_EXISTS');
  if (mine.verificationStatus !== 'VERIFIED' && hasEarlierRevokedOwner(rows, mine)) return fail('NOT_FIRST_REGISTRANT');

  // 5. 만료된 다른 행을 자동 종료한다.
  for (const row of others) {
    if (computeOwnershipVerificationStatus(row, now) === 'EXPIRED') await supersedeExpiredOwner(tx, row);
  }

  // 6. 내 행을 인증으로 저장하고 시도를 끝낸다. 유효기간은 지금 값으로 계산해 저장한다.
  const { validityYears } = await readValiditySetting(tx);
  const expiresAt = computeVerificationExpiry(now, validityYears);
  await saveVerified(tx, { ownershipId: mine.id, attemptId, verifiedAt: now, expiresAt });
  await finishAttempt(tx, attemptId, 'RUNNING', { status: 'VERIFIED', ledgerKind, ownerCount });

  await audit.record({
    action: 'OWNERSHIP_VERIFICATION_APPLIED',
    resourceType: 'OWNERSHIP',
    resourceId: mine.id,
    summary: 'VERIFIED',
    after: { attemptId, verificationStatus: 'VERIFIED', verificationExpiresAt: expiresAt },
    client: tx,
  });
  await recordActivity(tx, {
    userId: attempt.requestedBy,
    type: ACTIVITY_TYPES.OWNERSHIP_VERIFIED,
    complexId: attempt.ownership.property.complexId,
    propertyId: attempt.ownership.propertyId,
    params: { attemptId, expiresAt: expiresAt.toISOString(), ...toUnitParams(attempt.ownership.property) },
  });
  return { outcome: 'VERIFIED', expiresAt };
};

// 돌려주는 값: { outcome: 'VERIFIED', expiresAt } | { outcome: 'FAILED', reasonCode } | { outcome: 'IGNORED' }(늦은 결과).
// 판정 실패는 throw하지 않고 같은 트랜잭션에서 실패 기록을 커밋한다.
// uq_ownership_verified 충돌은 롤백 후 별도 트랜잭션에서 VERIFIED_OWNER_EXISTS로 끝낸다.
export const applyOwnershipVerification = async ({ attemptId, ledgerKind, ownerCount }, { saveVerified = defaultSaveVerified } = {}) => {
  try {
    return await prisma.$transaction((tx) => applyInTx(tx, { attemptId, ledgerKind, ownerCount, saveVerified }), TX_OPTIONS);
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    await prisma.$transaction((tx) => failAttemptInTx(tx, attemptId, 'RUNNING', 'VERIFIED_OWNER_EXISTS', { ledgerKind, ownerCount }));
    return { outcome: 'FAILED', reasonCode: 'VERIFIED_OWNER_EXISTS' };
  }
};
