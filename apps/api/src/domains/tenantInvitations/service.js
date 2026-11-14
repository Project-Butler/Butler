// 임차인 초대(api-contract.md 4장 "임차인 초대", docs/11 개발 계획 2-3).
// 토큰 원문은 inviteUrl에만 있고 DB·로그·감사에는 invitationId만 남긴다.
import { audit } from '../../platform/audit.js';
import { AppError } from '../../platform/AppError.js';
import { isContractReadOnly } from '../../platform/contractRules.js';
import { CONTRACT_INCLUDE, resolveContractViewer, toContractResponse } from '../../platform/contractSerializer.js';
import { computeContractStatus } from '../../platform/contractStatus.js';
import { getNow, getTodayKST, toDateOnlyString } from '../../platform/dateUtils.js';
import { toMoney } from '../../platform/money.js';
import { NOTIFICATION_TYPES, notify } from '../../platform/notify.js';
import { lockOwnershipRow } from '../../platform/ownershipLock.js';
import { computeOwnershipVerificationStatus } from '../../platform/ownershipStatus.js';
import { prisma } from '../../platform/prismaClient.js';
import { toPropertySummary } from '../../platform/propertySerializer.js';
import { cancelContractInvitationsInTx, revokeInvitationVerificationsInTx } from '../../platform/tenantInvitationLifecycle.js';
import { lockContractForOwner } from '../contracts/service.js';
import { findSharedInvitationDocument } from '../documents/service.js';
import {
  findSharedInvitationDocuments,
  issueSharedDocumentDownloadUrl,
  toSharedDocumentResponse,
} from './documentsAdapter.js';
import {
  INVITATION_TTL_MS,
  MAX_SHARED_DOCUMENTS,
  VERIFICATION_TTL_MS,
  applyVerifyFailure,
  computeInvitationStatus,
  evaluateVerifyAttempt,
  generateInvitationToken,
  generateVerificationSecret,
  hashToken,
  isTokenFormat,
  matchesPhoneLast4,
  phoneFingerprint,
  sha256Hex,
} from './rules.js';
import { assertUsableInvitation, requireVerification, throwInvitationUnusable } from './verificationSession.js';

// 공유 문서 수는 숨기지 않은 문서만 센다.
const INVITATION_INCLUDE = {
  contract: { include: CONTRACT_INCLUDE },
  _count: { select: { documents: { where: { document: { deletedAt: null } } } } },
};

const throwContractNotFound = () => {
  throw new AppError('CONTRACT_NOT_FOUND', 404, '계약을 찾을 수 없습니다.');
};

const throwAlreadyAccepted = (message = '이미 임차인이 초대를 수락한 계약이에요.') => {
  throw new AppError('INVITATION_ALREADY_ACCEPTED', 409, message);
};

const throwTenantAlreadyLinked = () => {
  throw new AppError('CONTRACT_TENANT_ALREADY_LINKED', 409, '이미 다른 임차인 계정이 연결된 계약이에요.');
};

// 초대 링크 앞부분. TENANT_APP_URL이 없으면 같은 앱 주소인 OAUTH_FRONTEND_URL을 쓴다(결정 5: 하나로 합친 앱).
// 둘 다 없으면 링크를 만들 수 없으므로 설정 오류(500)다.
export const resolveTenantAppUrl = (env = process.env) => {
  const base = env.TENANT_APP_URL || env.OAUTH_FRONTEND_URL;
  if (!base) throw new Error('TENANT_APP_URL(또는 OAUTH_FRONTEND_URL)이 설정되지 않아 초대 링크를 만들 수 없습니다.');
  return base.replace(/\/+$/, '');
};

const toInvitationResponse = (invitation, now, inviteUrl = null) => ({
  id: invitation.id,
  contractId: invitation.contractId,
  status: computeInvitationStatus(invitation, now),
  inviteUrl,
  expiresAt: invitation.expiresAt.toISOString(),
  sharedDocumentCount: invitation._count.documents,
  // 임대인 화면용: 연결 날짜, 본인 확인 하루 한도에 닿은 시각(결정 14 안내). 공개 요약(A-08)에는 쓰지 않는다.
  acceptedAt: invitation.acceptedAt ? invitation.acceptedAt.toISOString() : null,
  landlordAlertedAt: invitation.landlordAlertedAt ? invitation.landlordAlertedAt.toISOString() : null,
  createdAt: invitation.createdAt.toISOString(),
});

// token 형식이 아니면 찾지 않는다. 없으면 null.
export const findInvitationByToken = (client, token) =>
  isTokenFormat(token) ? client.tenantInvitation.findUnique({ where: { tokenHash: hashToken(token) }, include: INVITATION_INCLUDE }) : null;

const propertyDisplayName = (contract) => toPropertySummary(contract.ownership.property).displayName;
const propertyLink = (contract) => `/properties/${contract.ownership.propertyId}`;

// A-06 POST /contracts/:contractId/tenant-invitations
export const issueInvitation = async (user, contractId, { sharedDocumentIds }, req) => {
  const baseUrl = resolveTenantAppUrl();
  const token = generateInvitationToken();
  const now = getNow();
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      // 소유 관계를 먼저 잠가 수락·해지·번호 수정과 줄을 세운다.
      const { contract, ownership } = await lockContractForOwner(tx, user, contractId);
      const status = computeContractStatus(contract, getTodayKST());
      if (isContractReadOnly(status, Boolean(ownership.endedAt))) {
        throw new AppError('CONTRACT_READ_ONLY', 422, '만료·해지됐거나 소유가 끝난 계약이라 초대 링크를 만들 수 없어요.');
      }
      const accepted = await tx.tenantInvitation.findFirst({ where: { contractId, status: 'ACCEPTED' }, select: { id: true } });
      if (accepted || contract.tenantId) throwAlreadyAccepted();

      if (sharedDocumentIds.length > 0) {
        const found = await tx.document.count({
          where: { id: { in: sharedDocumentIds }, deletedAt: null, resourceType: 'CONTRACT', resourceId: contractId },
        });
        if (found !== sharedDocumentIds.length) throw new AppError('DOCUMENT_NOT_FOUND', 404, '문서를 찾을 수 없습니다.');
      }

      // R-13: 이전 PENDING 초대는 CANCELED, 그 확인 세션도 폐기.
      await cancelContractInvitationsInTx(tx, { id: contractId }, now);
      const invitation = await tx.tenantInvitation.create({
        data: {
          contractId,
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
          createdAt: now,
          createdBy: user.id,
          documents: { create: sharedDocumentIds.map((documentId) => ({ documentId })) },
        },
        include: INVITATION_INCLUDE,
      });
      await audit.record({
        actor: user,
        action: 'TENANT_INVITATION_ISSUED',
        resourceType: 'CONTRACT',
        resourceId: contractId,
        summary: `임차인 초대 발급(invitationId=${invitation.id}, 공유 문서 ${sharedDocumentIds.length}개)`,
        req,
        client: tx,
      });
      return invitation;
    });
  } catch (error) {
    // 계약당 PENDING 하나(부분 유니크) — 동시 재발급이 겹친 경우. 잠금이 먼저 막아서 보통은 닿지 않는다.
    if (error?.code === 'P2002') throwAlreadyAccepted('다른 요청이 먼저 처리됐어요. 잠시 후 다시 시도해 주세요.');
    throw error;
  }
  return toInvitationResponse(created, now, `${baseUrl}/invite/${token}`);
};

// A-07 GET /contracts/:contractId/tenant-invitations — 활성 소유자만. inviteUrl은 다시 주지 않는다.
export const listInvitations = async (user, contractId) => {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { ownership: { select: { userId: true, endedAt: true } } },
  });
  if (!contract || contract.ownership.userId !== user.id || contract.ownership.endedAt) throwContractNotFound();
  const rows = await prisma.tenantInvitation.findMany({
    where: { contractId },
    include: { _count: INVITATION_INCLUDE._count },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  const now = getNow();
  return rows.map((row) => toInvitationResponse(row, now));
};

// A-08 GET /tenant-invitations/:token — 공개. 금액·임차인 정보는 넣지 않는다(R-15).
export const findInvitationSummary = async (token) => {
  const invitation = await findInvitationByToken(prisma, token);
  const now = getNow();
  assertUsableInvitation(invitation, now);
  const { contract } = invitation;
  const { ownership } = contract;
  return {
    status: computeInvitationStatus(invitation, now),
    expiresAt: invitation.expiresAt.toISOString(),
    landlordName: ownership.user.name,
    landlordVerified: !ownership.endedAt && computeOwnershipVerificationStatus(ownership, now) === 'VERIFIED',
    propertyDisplayName: propertyDisplayName(contract),
    leaseType: contract.leaseType,
    startDate: toDateOnlyString(contract.startDate),
    endDate: toDateOnlyString(contract.endDate),
    sharedDocumentCount: invitation._count.documents,
  };
};

const logVerify = (kind, invitationId, count) => {
  if (kind === 'FAIL') console.info(`[invite] verify fail invitationId=${invitationId} count=${count}`);
  else console.info(`[invite] verify limited invitationId=${invitationId} kind=${kind}`);
};

// V-01 POST /tenant-invitations/:token/verify
// 실패·대기는 트랜잭션 안에서 던지지 않고 결과값으로 돌려준다 — 던지면 카운터·알림까지 롤백돼 대입 방지가 무력화된다.
// 쓸 수 없는 초대(통일 에러)는 카운터를 바꾸기 전이라 던져도 된다. 저장소 오류는 그대로 던진다(fail-closed).
// 결과: { kind: 'OK', secret, expiresAt } | { kind: 'FAIL' } | { kind: 'WAIT' | 'DAILY_LIMIT', retryAfterSeconds }
export const verifyInvitation = async ({ token, phoneLast4, currentSecret = null }) => {
  if (!isTokenFormat(token)) throwInvitationUnusable('INVITATION_INVALID');
  const tokenHash = hashToken(token);
  const outcome = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw`SELECT id::text AS id FROM tenant_invitations WHERE token_hash = ${tokenHash} FOR UPDATE`;
    if (locked.length === 0) throwInvitationUnusable('INVITATION_INVALID');
    const invitation = await tx.tenantInvitation.findUnique({ where: { id: locked[0].id }, include: INVITATION_INCLUDE });
    const now = getNow();
    assertUsableInvitation(invitation, now);

    const gate = evaluateVerifyAttempt(invitation, now);
    if (gate.kind !== 'ALLOWED') return { ...gate, invitationId: invitation.id };

    const { contract } = invitation;
    if (matchesPhoneLast4(contract.tenantPhone, phoneLast4)) {
      await tx.tenantInvitation.update({
        where: { id: invitation.id },
        data: { verifyFailCount: 0, verifyFailWindowStart: null, nextVerifyAt: null },
      });
      // 만료 행 정리(별도 cron 없음), 이 초대의 이전 세션은 새것으로 바꾼다.
      await tx.tenantInvitationVerification.deleteMany({ where: { invitationId: invitation.id, expiresAt: { lte: now } } });
      if (typeof currentSecret === 'string' && currentSecret.length > 0 && currentSecret.length <= 128) {
        await tx.tenantInvitationVerification.updateMany({
          where: { idHash: sha256Hex(currentSecret), invitationId: invitation.id, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      const secret = generateVerificationSecret();
      const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MS);
      await tx.tenantInvitationVerification.create({
        data: {
          idHash: sha256Hex(secret),
          invitationId: invitation.id,
          phoneFingerprint: phoneFingerprint(contract.id, contract.tenantPhone),
          expiresAt,
        },
      });
      return { kind: 'OK', secret, expiresAt, invitationId: invitation.id };
    }

    const next = applyVerifyFailure(invitation, now);
    await tx.tenantInvitation.update({
      where: { id: invitation.id },
      data: {
        verifyFailCount: next.verifyFailCount,
        verifyFailWindowStart: next.verifyFailWindowStart,
        nextVerifyAt: next.nextVerifyAt,
        ...(next.shouldAlertLandlord ? { landlordAlertedAt: now } : {}),
      },
    });
    if (next.shouldAlertLandlord) {
      await notify(tx, {
        userId: contract.ownership.userId,
        type: NOTIFICATION_TYPES.TENANT_INVITATION_VERIFY_FAILED,
        title: '초대 링크 본인 확인이 여러 번 실패했어요',
        body: `${propertyDisplayName(contract)} 초대 링크의 본인 확인이 오늘 여러 번 실패했어요. 새 링크를 만들어 보세요.`,
        link: propertyLink(contract),
        related: { resourceType: 'CONTRACT', resourceId: contract.id },
      });
    }
    if (next.reachedDailyLimit) {
      const windowEnd = next.verifyFailWindowStart.getTime() + 24 * 60 * 60 * 1000;
      return {
        kind: 'DAILY_LIMIT',
        retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now.getTime()) / 1000)),
        invitationId: invitation.id,
        count: next.verifyFailCount,
      };
    }
    return { kind: 'FAIL', invitationId: invitation.id, count: next.verifyFailCount };
  });
  if (outcome.kind === 'FAIL' || outcome.count) logVerify('FAIL', outcome.invitationId, outcome.count);
  if (outcome.kind === 'WAIT' || outcome.kind === 'DAILY_LIMIT') logVerify(outcome.kind, outcome.invitationId);
  return outcome;
};

// V-02 GET /tenant-invitations/:token/contract — 확인 세션 필요.
export const findInvitationContract = async (token, req) => {
  const invitation = await findInvitationByToken(prisma, token);
  await requireVerification(prisma, req, invitation);
  const { contract } = invitation;
  const documents = await findSharedInvitationDocuments(prisma, invitation);
  return {
    leaseType: contract.leaseType,
    deposit: toMoney(contract.deposit),
    monthlyRent: toMoney(contract.monthlyRent),
    rentPaymentDay: contract.rentPaymentDay ?? null,
    startDate: toDateOnlyString(contract.startDate),
    endDate: toDateOnlyString(contract.endDate),
    landlordName: contract.ownership.user.name,
    propertyDisplayName: propertyDisplayName(contract),
    sharedDocuments: documents.map(toSharedDocumentResponse),
  };
};

const throwDocumentNotFound = () => {
  throw new AppError('DOCUMENT_NOT_FOUND', 404, '문서를 찾을 수 없습니다.');
};

// V-03 POST /tenant-invitations/:token/documents/:documentId/download-url — 확인 세션 + 그 초대의 공유 문서만.
export const issueInvitationDocumentDownloadUrl = async (token, documentId, req, { isValidDocumentId }) => {
  const invitation = await findInvitationByToken(prisma, token);
  await requireVerification(prisma, req, invitation);
  const document = isValidDocumentId ? await findSharedInvitationDocument({ invitationId: invitation.id, contractId: invitation.contractId, documentId }) : null;
  if (!document) throwDocumentNotFound();
  return issueSharedDocumentDownloadUrl(prisma, { invitation, document, req });
};

// 수락 전용 잠금: lockContractForOwner와 같은 순서(계약 읽기 → 소유 관계 FOR UPDATE)에서 소유자 검사만 뺐다.
const lockOwnershipForAccept = async (tx, contractId) => {
  const found = await tx.contract.findUnique({ where: { id: contractId }, select: { ownershipId: true } });
  if (!found) throwInvitationUnusable('INVITATION_INVALID');
  return lockOwnershipRow(tx, found.ownershipId);
};

// 수락 트랜잭션(A-09·가입·OAuth 가입 공통). 호출하는 쪽 인터랙티브 트랜잭션(tx) 안에서 부른다.
// 잠금 순서: 소유 관계 → 계약 → 초대. 잠근 뒤 '쓸 수 있는 초대'와 확인 세션(req.cookies.bt_iv)을 다시 본다.
// 실패하면 던진다(호출한 쪽 트랜잭션 전체가 롤백 — 가입도 되돌아간다). 연결된 계약(CONTRACT_INCLUDE)을 돌려준다.
// actor: 감사 로그 행위자(기본은 수락한 사용자).
export const acceptInvitationInTx = async (tx, { invitationId, userId, req, actor = { id: userId } }) => {
  const found = await tx.tenantInvitation.findUnique({ where: { id: invitationId }, select: { contractId: true } });
  if (!found) throwInvitationUnusable('INVITATION_INVALID');
  await lockOwnershipForAccept(tx, found.contractId);
  await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${found.contractId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM tenant_invitations WHERE id = ${invitationId}::uuid FOR UPDATE`;
  // 잠근 뒤 다시 읽는다(계약·소유 관계 포함).
  const invitation = await tx.tenantInvitation.findUnique({ where: { id: invitationId }, include: INVITATION_INCLUDE });
  const now = getNow();
  await requireVerification(tx, req, invitation, now);
  const { contract } = invitation;

  if (contract.tenantId === userId) throwAlreadyAccepted('이미 내 계정에 연결된 계약이에요.');
  if (contract.tenantId) throwTenantAlreadyLinked();
  const linked = await tx.contract.updateMany({ where: { id: contract.id, tenantId: null }, data: { tenantId: userId } });
  if (linked.count === 0) throwTenantAlreadyLinked();
  const accepted = await tx.tenantInvitation.updateMany({
    where: { id: invitationId, status: 'PENDING', expiresAt: { gt: now } },
    data: { status: 'ACCEPTED', acceptedAt: now, acceptedBy: userId },
  });
  if (accepted.count === 0) throwInvitationUnusable('INVITATION_EXPIRED');

  await revokeInvitationVerificationsInTx(tx, [invitationId], now);
  await notify(tx, {
    userId: contract.ownership.userId,
    type: NOTIFICATION_TYPES.TENANT_INVITATION_ACCEPTED,
    title: '임차인이 초대를 수락했어요',
    body: `${propertyDisplayName(contract)} 계약에 임차인 계정이 연결됐어요.`,
    link: propertyLink(contract),
    related: { resourceType: 'CONTRACT', resourceId: contract.id },
  });
  await audit.record({
    actor,
    action: 'TENANT_INVITATION_ACCEPTED',
    resourceType: 'CONTRACT',
    resourceId: contract.id,
    summary: `임차인 초대 수락(invitationId=${invitationId})`,
    req,
    client: tx,
  });
  // TODO(schedule): 임차인 종료일 SYSTEM 일정 — 일정 기능이 생기면 붙인다.
  return tx.contract.findUnique({ where: { id: contract.id }, include: CONTRACT_INCLUDE });
};

// A-09 POST /tenant-invitations/:token/accept — TENANT + 확인 세션.
export const acceptInvitation = async (user, token, req) => {
  const { contract, invitationId } = await prisma.$transaction(async (tx) => {
    const invitation = await findInvitationByToken(tx, token);
    if (!invitation) throwInvitationUnusable('INVITATION_INVALID');
    const row = await acceptInvitationInTx(tx, { invitationId: invitation.id, userId: user.id, req });
    return { contract: row, invitationId: invitation.id };
  });
  console.info(`[invite] accepted invitationId=${invitationId}`);
  return toContractResponse(contract, { viewer: resolveContractViewer(contract, user), todayKST: getTodayKST() });
};
