// 임차인 초대 규칙(DB 의존 없음). docs/11 개발 계획 2-2·2-3, api-contract.md 4장 "임차인 초대".
import { createHash, randomBytes } from 'node:crypto';
import { isContractReadOnly } from '../../platform/contractRules.js';
import { computeContractStatus } from '../../platform/contractStatus.js';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const VERIFICATION_TTL_MS = 30 * 60 * 1000;
// 결정 13: 공유 문서 한도
export const MAX_SHARED_DOCUMENTS = 10;
// 결정 12: 24시간 창 안 실패 15회면 창이 끝날 때까지 막는다.
export const DAILY_FAIL_LIMIT = 15;
export const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
// 실패 3회부터 다음 시도까지 30초 → 2분 → 10분(이후 10분).
const WAIT_STEPS_MS = [30 * 1000, 2 * 60 * 1000, 10 * 60 * 1000];
const WAIT_FROM_FAIL_COUNT = 3;

// 토큰 원문은 링크에만 있고 DB에는 sha256 hex만 둔다(R-12).
export const generateInvitationToken = () => randomBytes(24).toString('base64url');
export const generateVerificationSecret = () => randomBytes(32).toString('base64url');
export const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');
export const hashToken = sha256Hex;

// base64url 문자만, 길이 상한. 형식이 아니면 찾지 않고 404로 본다.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
export const isTokenFormat = (value) => typeof value === 'string' && TOKEN_PATTERN.test(value);

// 확인 세션이 만들어질 때의 계약 번호. 번호가 바뀌면 같은 세션을 더 쓸 수 없다.
export const phoneFingerprint = (contractId, tenantPhone) => sha256Hex(`${contractId}${tenantPhone}`);

const PHONE_LAST4_PATTERN = /^\d{4}$/;
export const isPhoneLast4Format = (value) => typeof value === 'string' && PHONE_LAST4_PATTERN.test(value);
export const matchesPhoneLast4 = (tenantPhone, phoneLast4) =>
  isPhoneLast4Format(phoneLast4) && typeof tenantPhone === 'string' && tenantPhone.length >= 4 && tenantPhone.slice(-4) === phoneLast4;

// R-14: DB 상태 + 만료 시각으로 응답 상태를 계산한다(EXPIRED는 저장하지 않는다).
export const computeInvitationStatus = (invitation, now) =>
  invitation.status === 'PENDING' && invitation.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : invitation.status;

// '쓸 수 있는 초대'가 아닐 때의 통일 에러 코드. 쓸 수 있으면 null.
// contract: { startDate, endDate, terminatedOn }, ownershipEnded: 소유 관계가 끝났는지.
export const invitationUnusableReason = (invitation, { contract, ownershipEnded, now, todayKST }) => {
  if (!invitation) return 'INVITATION_INVALID';
  const status = computeInvitationStatus(invitation, now);
  if (status === 'ACCEPTED') return 'INVITATION_ALREADY_ACCEPTED';
  if (status !== 'PENDING') return 'INVITATION_EXPIRED';
  if (isContractReadOnly(computeContractStatus(contract, todayKST), ownershipEnded)) return 'INVITATION_EXPIRED';
  return null;
};

// 실패 count회 뒤 다음 시도까지 기다릴 시간(ms). 3회 미만은 0.
export const waitMsAfterFailures = (count) => {
  if (count < WAIT_FROM_FAIL_COUNT) return 0;
  return WAIT_STEPS_MS[Math.min(count - WAIT_FROM_FAIL_COUNT, WAIT_STEPS_MS.length - 1)];
};

// 24시간 창이 지났으면 실패 수를 0으로 본다.
const isWindowOpen = (invitation, now) =>
  Boolean(invitation.verifyFailWindowStart) && now.getTime() - invitation.verifyFailWindowStart.getTime() < DAILY_WINDOW_MS;

const secondsUntil = (date, now) => Math.max(1, Math.ceil((date.getTime() - now.getTime()) / 1000));

// 비교하기 전 판정. 대기·하루 한도 중이면 비교하지 않고 실패로도 세지 않는다.
// 결과: { kind: 'DAILY_LIMIT', retryAfterSeconds } | { kind: 'WAIT', retryAfterSeconds } | { kind: 'ALLOWED' }
export const evaluateVerifyAttempt = (invitation, now) => {
  if (isWindowOpen(invitation, now) && invitation.verifyFailCount >= DAILY_FAIL_LIMIT) {
    const windowEnd = new Date(invitation.verifyFailWindowStart.getTime() + DAILY_WINDOW_MS);
    return { kind: 'DAILY_LIMIT', retryAfterSeconds: secondsUntil(windowEnd, now) };
  }
  if (invitation.nextVerifyAt && invitation.nextVerifyAt.getTime() > now.getTime()) {
    return { kind: 'WAIT', retryAfterSeconds: secondsUntil(invitation.nextVerifyAt, now) };
  }
  return { kind: 'ALLOWED' };
};

// 비교 실패 뒤 저장할 카운터. reachedDailyLimit은 이번 실패로 하루 한도에 닿았는지.
// shouldAlertLandlord: 이번 창에서 아직 임대인 알림을 보내지 않았으면 true(하루 한 번).
export const applyVerifyFailure = (invitation, now) => {
  const windowOpen = isWindowOpen(invitation, now);
  const verifyFailWindowStart = windowOpen ? invitation.verifyFailWindowStart : now;
  const verifyFailCount = (windowOpen ? invitation.verifyFailCount : 0) + 1;
  const waitMs = waitMsAfterFailures(verifyFailCount);
  const reachedDailyLimit = verifyFailCount >= DAILY_FAIL_LIMIT;
  const alreadyAlerted =
    Boolean(invitation.landlordAlertedAt) && invitation.landlordAlertedAt.getTime() >= verifyFailWindowStart.getTime();
  return {
    verifyFailCount,
    verifyFailWindowStart,
    nextVerifyAt: waitMs > 0 ? new Date(now.getTime() + waitMs) : null,
    reachedDailyLimit,
    shouldAlertLandlord: reachedDailyLimit && !alreadyAlerted,
  };
};

// 확인 세션 행이 지금 이 초대·이 계약 번호에 쓸 수 있는지.
export const isVerificationUsable = (verification, { invitationId, fingerprint, now }) =>
  Boolean(verification) &&
  verification.invitationId === invitationId &&
  !verification.revokedAt &&
  verification.expiresAt.getTime() > now.getTime() &&
  verification.phoneFingerprint === fingerprint;
