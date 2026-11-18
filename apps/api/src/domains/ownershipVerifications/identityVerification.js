// Created: 2026-11-17 04:04
// 권리자 인증 시작 전 본인인증(포트원 V2 · KG이니시스 통합인증) 결과 조회와 판정.
// 프론트가 보낸 인적사항은 믿지 않고, 서버가 API Secret으로 포트원에 직접 조회한 값만 쓴다.
// 조회 결과(이름·생년월일·CI 등)는 저장하지 않고 로그에도 남기지 않는다.
import { AppError } from '../../platform/AppError.js';

const PORTONE_API_URL = 'https://api.portone.io';
const LOOKUP_TIMEOUT_MS = 10 * 1000;

// 본인인증을 마친 뒤 이 시간 안에 권리자 인증을 시작해야 한다. 오래된 인증을 다시 쓰지 못하게 한다.
export const IDENTITY_VERIFICATION_VALID_MS = 10 * 60 * 1000;

// 사용 기록(identity_verification_uses) 보관 기간. 재사용 차단에는 유효 시간(10분)만 필요하고,
// 그 뒤에는 EXPIRED가 먼저 거절하므로 서버 시각 차이를 넉넉히 더해 하루만 둔다.
export const IDENTITY_VERIFICATION_USE_RETENTION_MS = 24 * 60 * 60 * 1000;

// 사용 기록 정리 주기 실행. 매일 01:00 한국 시간(UTC 16:00).
// 실제 등록은 apps/api/vercel.json(A팀 파일)의 crons — B팀이 넣지 않는다(팀에 요청).
export const PURGE_SCHEDULE = { path: '/api/cron/ownership-identity-verifications', cron: '0 16 * * *', kst: '매일 01:00' };

// 포트원 ID 형식(프론트가 만든 영문·숫자). 길이 상한은 넉넉히 둔다.
export const IDENTITY_VERIFICATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

const ERRORS = {
  NOT_VERIFIED: ['IDENTITY_VERIFICATION_NOT_VERIFIED', 422, '본인인증이 완료되지 않았습니다. 다시 인증해 주세요.'],
  EXPIRED: ['IDENTITY_VERIFICATION_EXPIRED', 422, '본인인증 후 시간이 지났습니다. 다시 인증해 주세요.'],
  MISMATCH: ['IDENTITY_VERIFICATION_MISMATCH', 422, '본인인증한 인적사항이 회원 정보와 일치하지 않습니다.'],
  ALREADY_USED: ['IDENTITY_VERIFICATION_ALREADY_USED', 409, '이미 사용한 본인인증입니다. 다시 인증해 주세요.'],
  UNAVAILABLE: ['IDENTITY_VERIFICATION_UNAVAILABLE', 503, '본인인증 결과를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.'],
};

export const identityVerificationError = (reason) => new AppError(...ERRORS[reason]);

// 상태 코드만 남긴다(응답 본문에 인적사항이 있을 수 있다).
const logLookupFailure = (detail) => {
  console.error('[ownership-verification] 본인인증 조회 실패', detail);
};

// GET /identity-verifications/{id}. 포트원에 없는 ID(404)는 null. 설정 없음·네트워크·5xx는 503.
export const fetchIdentityVerification = async (identityVerificationId, { env = process.env, fetchImpl = fetch } = {}) => {
  const secret = env.PORTONE_API_SECRET;
  if (!secret) throw identityVerificationError('UNAVAILABLE');

  let response;
  try {
    response = await fetchImpl(`${PORTONE_API_URL}/identity-verifications/${encodeURIComponent(identityVerificationId)}`, {
      headers: { Authorization: `PortOne ${secret}` },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
  } catch (error) {
    logLookupFailure(error?.name ?? 'unknown');
    throw identityVerificationError('UNAVAILABLE');
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    logLookupFailure(response.status);
    throw identityVerificationError('UNAVAILABLE');
  }
  try {
    return await response.json();
  } catch {
    logLookupFailure('INVALID_JSON');
    throw identityVerificationError('UNAVAILABLE');
  }
};

// 권리자 인증의 대장 대조(platform matchOwner)와 같은 기준: NFC 정규화 후 공백을 모두 뺀다.
const normalizeName = (name) => (typeof name === 'string' ? name.normalize('NFC').replace(/\s+/g, '') : '');

// 조회 결과 → 거절 사유(NOT_VERIFIED·EXPIRED·MISMATCH) 또는 null(통과).
// identity: 회원 정보 { name, birthDate(YYYY-MM-DD) }. skipIdentityMatch(테스트 모드)면 인적사항 대조만 건너뛴다.
export const judgeIdentityVerification = (verification, identity, { now = new Date(), skipIdentityMatch = false } = {}) => {
  if (verification?.status !== 'VERIFIED') return 'NOT_VERIFIED';
  const verifiedAt = Date.parse(verification.verifiedAt);
  if (!Number.isFinite(verifiedAt)) return 'NOT_VERIFIED';
  if (now.getTime() - verifiedAt > IDENTITY_VERIFICATION_VALID_MS) return 'EXPIRED';
  if (skipIdentityMatch) return null;

  const customer = verification.verifiedCustomer ?? {};
  const name = normalizeName(customer.name);
  const isMatch =
    Boolean(name) &&
    name === normalizeName(identity?.name) &&
    typeof customer.birthDate === 'string' &&
    customer.birthDate === identity?.birthDate;
  return isMatch ? null : 'MISMATCH';
};

// 조회 + 판정. 통과하지 못하면 AppError를 던진다.
export const assertIdentityVerified = async ({ identityVerificationId, identity, testMode = false, now = new Date(), lookup = fetchIdentityVerification }) => {
  const verification = await lookup(identityVerificationId);
  const reason = judgeIdentityVerification(verification, identity, { now, skipIdentityMatch: testMode });
  if (reason) throw identityVerificationError(reason);
};
