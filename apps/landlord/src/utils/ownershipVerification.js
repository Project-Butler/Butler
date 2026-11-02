// 권리자 인증 화면이 쓰는 판단·문구(DB·React 없음). 기준: docs 권리자 인증 연결 계획 4·8·12장.
import { daysBetween, getTodayKST } from './contract';
import { formatDateKST } from './format';

export const VERIFICATION_FAILED_MESSAGE = '소유자 정보를 확인하지 못했어요. 관리자에게 문의해 주세요.';
export const VERIFICATION_PREPARING_MESSAGE = '권리자 인증을 준비 중이에요. 잠시 후 다시 시도해 주세요.';
export const VERIFICATION_RUNNING_MESSAGE = '소유자 정보를 확인하고 있어요. 화면을 나가도 계속 진행돼요.';
export const VERIFICATION_REVOKED_MESSAGE = '이 호실의 인증이 취소됐어요. 다시 인증하려면 관리자에게 문의해 주세요.';

export const RUNNER_UNAVAILABLE_CODE = 'VERIFICATION_RUNNER_UNAVAILABLE';
export const VERIFICATION_REVOKED_CODE = 'VERIFICATION_REVOKED';

// 서버 재인증 대상 조회(RENEWAL_WINDOW_DAYS)와 같은 값
const RENEWAL_WINDOW_DAYS = 30;

export const isAttemptActive = (attempt) => attempt?.status === 'PENDING' || attempt?.status === 'RUNNING';

// 'YYYY-MM-DD', 실제 있는 날짜, 오늘(KST) 이하. 비어 있으면 오류가 아니다(버튼 비활성으로 표시).
export const validateBirthDate = (value, today = getTodayKST()) => {
  if (!value) return undefined;
  const isShapeValid = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(`${value}T00:00:00Z`);
  const isRealDate = isShapeValid && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  if (!isRealDate) return '생년월일을 다시 확인해 주세요.';
  return value > today ? '오늘 이후 날짜는 입력할 수 없어요.' : undefined;
};

// 만료까지 남은 날(KST 달력). 지났으면 음수, 만료일이 없으면 null.
export const getDaysUntilExpiry = (expiresAt, now = new Date()) =>
  expiresAt ? daysBetween(formatDateKST(now.toISOString()), formatDateKST(expiresAt)) : null;

const isWithinRenewalWindow = ({ verificationExpiresAt }, now) => {
  const days = getDaysUntilExpiry(verificationExpiresAt, now);
  return days !== null && days <= RENEWAL_WINDOW_DAYS;
};

// 호실 상세·인증 화면의 다음 행동. VERIFY: 첫 인증, RENEW: 재인증, INQUIRY: 관리자 문의, null: 할 일 없음.
export const getVerificationAction = (ownership, now = new Date()) => {
  if (!ownership?.isActive) return null;
  switch (ownership.verificationStatus) {
    case 'REVOKED':
      return 'INQUIRY';
    case 'EXPIRED':
      return 'RENEW';
    case 'VERIFIED':
      return isWithinRenewalWindow(ownership, now) ? 'RENEW' : null;
    default:
      return 'VERIFY';
  }
};

// 만료되면 커뮤니티 쓰기 권한까지 잃는지. 권한은 법정동 단위라 같은 법정동에 유효한 호실이 남으면 잃지 않는다.
// verifiedLegalDongCodes에는 아직 만료 전인 대상 자신도 들어 있어, 만료 전이면 내 활성 소유 관계에서 다른 호실을 확인한다.
// 대상보다 먼저 끝나는 호실은 대상이 만료될 때 남아 있지 않으므로 세지 않는다.
export const losesCommunityAccess = (target, { verifiedLegalDongCodes = [], activeOwnerships = [] } = {}) => {
  const legalDongCode = target.property.complex.legalDongCode;
  if (!verifiedLegalDongCodes.includes(legalDongCode)) return true;
  if (target.verificationStatus === 'EXPIRED') return false;

  return !activeOwnerships.some(
    (ownership) =>
      ownership.id !== target.id &&
      ownership.property.complex.legalDongCode === legalDongCode &&
      ownership.verificationStatus === 'VERIFIED' &&
      (!ownership.verificationExpiresAt || ownership.verificationExpiresAt > target.verificationExpiresAt),
  );
};

export const buildRenewalMessage = (mentionsCommunity) =>
  mentionsCommunity
    ? '인증이 만료되면 호실 정보를 수정할 수 없고, 커뮤니티에 글을 쓸 수 없어요. 재인증하면 다시 쓸 수 있어요. 계약은 그대로 유지돼요.'
    : '인증이 만료되면 호실 정보를 수정할 수 없어요. 재인증하면 다시 수정할 수 있어요. 계약은 그대로 유지돼요.';

// 재인증 대상 → 화면에 쓸 안내
export const toRenewalNotices = (targets, context, now = new Date()) =>
  targets.map((target) => {
    const mentionsCommunity = losesCommunityAccess(target, context);
    return {
      id: target.id,
      propertyId: target.property.id,
      displayName: target.property.displayName,
      expiresOn: formatDateKST(target.verificationExpiresAt),
      daysUntilExpiry: getDaysUntilExpiry(target.verificationExpiresAt, now),
      isExpired: target.verificationStatus === 'EXPIRED',
      mentionsCommunity,
      message: buildRenewalMessage(mentionsCommunity),
    };
  });

// 소유 종료 사유 칩. 매도만 진행 중 계약이 있어도 끝나는 SOLD로 보내고, 나머지는 서버 기본값(SELF_ENDED)을 쓴다.
export const END_REASONS = [{ label: '매도', endReason: 'SOLD' }, { label: '증여' }, { label: '기타' }];

export const isSoldReason = (label) => END_REASONS.find((option) => option.label === label)?.endReason === 'SOLD';

export const toOwnershipEndBody = (label) => {
  const option = END_REASONS.find((item) => item.label === label);
  if (!option) return {};
  return option.endReason ? { reason: option.label, endReason: option.endReason } : { reason: option.label };
};
