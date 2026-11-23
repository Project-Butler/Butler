// 하우스 로그 규칙(DB 의존 없음). 계약 5장, docs/5. 부동산 관리 로그 개발/명세.md.
import { computeOwnershipVerificationStatus } from './ownershipStatus.js';

export const MANAGEMENT_LOG_SCOPES = ['PRIVATE', 'PROPERTY_HISTORY'];
// 요청으로 쓸 수 있는 유형. TICKET_SUMMARY는 시스템만 쓴다.
export const MANAGEMENT_LOG_WRITABLE_TYPES = ['REPAIR', 'INSPECTION', 'NOTE'];
export const MANAGEMENT_LOG_TYPES = [...MANAGEMENT_LOG_WRITABLE_TYPES, 'TICKET_SUMMARY'];
export const MANAGEMENT_LOG_EDITABLE_FIELDS = ['type', 'title', 'content', 'occurredOn', 'cost', 'room'];
// 목록 검색어(q) 길이. 통합 검색과 같다(domains/search/searchQuery.js).
export const MAX_LOG_QUERY_LENGTH = 50;

// 'YYYY-MM-DD'이고 실제로 있는 날짜인지. 오래된 수리 이력과 미래 예정도 쓰므로 범위는 막지 않는다(D-10).
// 연도 오타(0998 등)만 거른다.
export const isValidLogDate = (value) => {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const isOwnershipVerified =(ownership, now = new Date()) =>
  computeOwnershipVerificationStatus(ownership, now) === 'VERIFIED';

// 보이는 범위(명세 4-4). ownerships: 요청자의 소유 관계 전부(활성·종료, removedAt 칸 포함).
// 1) 내 소유 관계에 붙은 기록(시스템 기록 포함) 2) 인증된 활성 소유자면 그 호실의 모든 호실 이력.
// [목록에서 지우기]한 소유 관계(removedAt)는 1)에서 빼고, 내가 숨긴 기록(H-41)은 뺀다.
// 같은 호실을 다시 사서 지금 인증된 활성 소유자면 그 호실의 숨김은 무시한다(내 호실 이력이 다시 보이게).
// 인증 만료는 저장값이 아니라 계산값이라 쿼리 조건으로 못 쓴다. 소유 관계를 먼저 읽어 여기서 판정한다.
export const toVisibleLogWhere = (user, ownerships, now = new Date()) => {
  if (user.role === 'ADMIN') return {};
  const verifiedPropertyIds = ownerships
    .filter((ownership) => !ownership.endedAt && isOwnershipVerified(ownership, now))
    .map((ownership) => ownership.propertyId);
  const notHidden = { hides: { none: { userId: user.id } } };
  return {
    AND: [
      {
        OR: [
          { ownershipId: { in: ownerships.filter((ownership) => !ownership.removedAt).map((ownership) => ownership.id) } },
          { scope: 'PROPERTY_HISTORY', propertyId: { in: verifiedPropertyIds } },
        ],
      },
      verifiedPropertyIds.length > 0 ? { OR: [notHidden, { propertyId: { in: verifiedPropertyIds } }] } : notHidden,
    ],
  };
};

// 늘 호실 이력으로 남는 유형(인증 활성 소유자). 메모는 나만 보기를 고를 수 있다(H-29).
export const PROPERTY_HISTORY_ONLY_TYPES = ['REPAIR', 'INSPECTION'];

// 새 기록의 공개 범위(H-29·H-45). verified: 쓰는 소유 관계가 지금 인증 상태인지.
// 돌려주는 값: { scope, keepPrivate } 또는 { error }.
// error: INVALID_COMBINATION(keepPrivate와 PROPERTY_HISTORY를 함께 요청, 400), SCOPE_NOT_ALLOWED(인증 소유자가 수리·점검을 나만 보기로, 400),
//        VERIFICATION_REQUIRED(인증 전 PROPERTY_HISTORY 요청, 403).
export const resolveCreateScope = ({ type, keepPrivate = false, requestedScope = null, verified }) => {
  if (keepPrivate && requestedScope === 'PROPERTY_HISTORY') return { error: 'INVALID_COMBINATION' };
  const historyOnly = PROPERTY_HISTORY_ONLY_TYPES.includes(type);
  const wantsPrivate = keepPrivate || requestedScope === 'PRIVATE';
  // 인증 전: 모두 나만 보기. 수리·점검은 나만 보기 뜻을 남기지 않는다(인증 뒤 올리기 대상).
  if (!verified) {
    if (requestedScope === 'PROPERTY_HISTORY') return { error: 'VERIFICATION_REQUIRED' };
    return { scope: 'PRIVATE', keepPrivate: !historyOnly && wantsPrivate };
  }
  if (historyOnly) return wantsPrivate ? { error: 'SCOPE_NOT_ALLOWED' } : { scope: 'PROPERTY_HISTORY', keepPrivate: false };
  // 메모에서 PRIVATE를 직접 요청하면 나만 보기를 고른 것으로 본다.
  return { scope: wantsPrivate ? 'PRIVATE' : 'PROPERTY_HISTORY', keepPrivate: wantsPrivate };
};

// 그 기록이 붙은 소유 관계의 인증된 활성 소유자인지(수리 요청 완료 요약을 고치고 지울 수 있는 사람, H-47).
const isActiveVerifiedOwner = (log, user, now) =>
  log.ownership.userId === user.id && !log.ownership.endedAt && isOwnershipVerified(log.ownership, now);

// 끝난(목록에서 지우지 않은) 내 소유 관계의 나만 보기 기록(H-41). 매도 뒤 새 기록과 매도 전 나만 보기 메모.
const isOwnEndedPrivate = (log, user) =>
  log.authorId === user.id && Boolean(log.ownership.endedAt) && !log.ownership.removedAt && log.scope === 'PRIVATE';

// 수정 가능 여부. 작성자이고 소유 관계가 활성이어야 하며, 호실 이력은 지금도 인증 상태여야 한다(D-16).
// 수리 요청 완료 요약(TICKET_SUMMARY, 작성자 없음)은 그 소유 관계의 인증된 활성 소유자가 고친다(H-47).
// 소유가 끝난 뒤에는 자기 나만 보기 기록만 고친다(H-41). 넘어간 호실 이력·요약은 고칠 수 없다.
export const canEditLog = (log, user, now = new Date()) => {
  if (log.type === 'TICKET_SUMMARY') return isActiveVerifiedOwner(log, user, now);
  if (log.ownership.endedAt) return isOwnEndedPrivate(log, user);
  return log.authorId === user.id && (log.scope !== 'PROPERTY_HISTORY' || isOwnershipVerified(log.ownership, now));
};

// 숨김만 되는 기록인지(H-41): 끝난 내 소유 관계의 호실 이력·수리 요청 완료 요약. 지우면 내 화면에서만 사라지고
// 다음 소유자에게는 그대로 보인다. 판정은 기록이 붙은 소유 관계 기준.
export const isHideOnlyLog = (log, user) =>
  log.ownership.userId === user.id &&
  Boolean(log.ownership.endedAt) &&
  (log.scope === 'PROPERTY_HISTORY' || log.type === 'TICKET_SUMMARY');

// 삭제 가능 여부(H-36·H-47·H-41). 숨김(isHideOnlyLog)도 삭제로 본다.
// 1) 작성자 + 활성 소유 관계 + (나만 보기이거나 지금 인증 상태) — 호실 이력도 지울 수 있다.
// 2) 수리 요청 완료 요약은 그 소유 관계의 인증된 활성 소유자.
// 3) 소유가 끝난 뒤: 자기 나만 보기 기록은 실제로 지우고(D-13), 넘어간 호실 이력·요약은 숨긴다.
export const canDeleteLog = (log, user, now = new Date()) => {
  if (isHideOnlyLog(log, user)) return true;
  if (log.type === 'TICKET_SUMMARY') return isActiveVerifiedOwner(log, user, now);
  if (log.authorId !== user.id) return false;
  if (log.ownership.endedAt) return log.scope === 'PRIVATE';
  return log.scope === 'PRIVATE' || isOwnershipVerified(log.ownership, now);
};
