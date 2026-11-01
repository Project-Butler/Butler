// 관리 로그 규칙(DB 의존 없음). 계약 5장, docs/5. 부동산 관리 로그 개발/명세.md.
import { computeOwnershipVerificationStatus } from './ownershipStatus.js';

export const MANAGEMENT_LOG_SCOPES = ['PRIVATE', 'PROPERTY_HISTORY'];
// 요청으로 쓸 수 있는 유형. TICKET_SUMMARY는 시스템만 쓴다.
export const MANAGEMENT_LOG_WRITABLE_TYPES = ['REPAIR', 'INSPECTION', 'NOTE'];
export const MANAGEMENT_LOG_TYPES = [...MANAGEMENT_LOG_WRITABLE_TYPES, 'TICKET_SUMMARY'];
export const MANAGEMENT_LOG_EDITABLE_FIELDS = ['type', 'title', 'content', 'occurredOn', 'cost'];

export const isOwnershipVerified = (ownership, now = new Date()) =>
  computeOwnershipVerificationStatus(ownership, now) === 'VERIFIED';

// 보이는 범위(명세 4-4). ownerships: 요청자의 소유 관계 전부(활성·종료).
// 1) 내 소유 관계에 붙은 기록(시스템 기록 포함) 2) 인증된 활성 소유자면 그 호실의 모든 호실 이력.
// 인증 만료는 저장값이 아니라 계산값이라 쿼리 조건으로 못 쓴다. 소유 관계를 먼저 읽어 여기서 판정한다.
export const toVisibleLogWhere = (user, ownerships, now = new Date()) => {
  if (user.role === 'ADMIN') return {};
  const verifiedPropertyIds = ownerships
    .filter((ownership) => !ownership.endedAt && isOwnershipVerified(ownership, now))
    .map((ownership) => ownership.propertyId);
  return {
    OR: [
      { ownershipId: { in: ownerships.map((ownership) => ownership.id) } },
      { scope: 'PROPERTY_HISTORY', propertyId: { in: verifiedPropertyIds } },
    ],
  };
};

// 수정 가능 여부. 작성자이고 소유 관계가 활성이어야 하며, 호실 이력은 지금도 인증 상태여야 한다(D-16).
export const canEditLog = (log, user, now = new Date()) =>
  log.authorId === user.id &&
  !log.ownership.endedAt &&
  (log.scope !== 'PROPERTY_HISTORY' || isOwnershipVerified(log.ownership, now));
