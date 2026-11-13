// 티켓(수리·점검 요청) 규칙(DB 의존 없음). 계약 5장 "티켓", 10장 TicketStatus·TicketCategory.

// 닫힌 Enum(10장). Prisma enum TicketStatus와 같다.
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED'];
// 등록형(10장). 피처가 추가하면 여기에 넣는다.
export const TICKET_CATEGORIES = ['REPAIR', 'INSPECTION', 'OTHER'];
// 끝 상태. 이 상태의 티켓은 더 바꿀 수 없다(422 TICKET_READ_ONLY).
export const TICKET_END_STATUSES = ['DONE', 'CANCELED'];
// 진행 중 계약 = 시작 전·진행 중(만료 임박 포함). 이 계약의 임차인만 요청할 수 있다.
export const TICKET_REQUESTABLE_CONTRACT_STATUSES = ['UPCOMING', 'ACTIVE', 'EXPIRING_SOON'];

export const MAX_TICKET_TITLE_LENGTH = 100;
export const MAX_TICKET_DESCRIPTION_LENGTH = 3000;
// 계약에 길이 제한이 없어 설명과 같은 값을 쓴다.
export const MAX_TICKET_RESOLUTION_NOTE_LENGTH = 3000;

// 상태 전이. OPEN → IN_PROGRESS·DONE·CANCELED, IN_PROGRESS → DONE·CANCELED.
const TRANSITIONS = {
  OPEN: ['IN_PROGRESS', 'DONE', 'CANCELED'],
  IN_PROGRESS: ['DONE', 'CANCELED'],
  DONE: [],
  CANCELED: [],
};

export const isTicketEnded = (status) => TICKET_END_STATUSES.includes(status);

// 요청자 기준 이 티켓과의 관계. 둘 다 아닐 수 있다(운영자 등).
// ticket: { requesterId, ownership: { userId, endedAt } }
export const resolveTicketActor = (ticket, user) => {
  const isOwner = ticket.ownership.userId === user.id;
  return {
    isOwner,
    isActiveOwner: isOwner && !ticket.ownership.endedAt,
    isRequester: ticket.requesterId === user.id,
  };
};

// 다음 상태로 바꿀 수 있는지. 'OK' | 'INVALID_TRANSITION' | 'FORBIDDEN'.
// IN_PROGRESS·DONE은 활성 소유자만, CANCELED는 활성 소유자·요청자 모두.
export const checkTicketTransition = (current, next, actor) => {
  if (!TRANSITIONS[current]?.includes(next)) return 'INVALID_TRANSITION';
  if (actor.isActiveOwner) return 'OK';
  if (next === 'CANCELED' && actor.isRequester) return 'OK';
  return 'FORBIDDEN';
};

// 요청자가 고칠 수 있는 칸(OPEN일 때만)과 활성 소유자가 고칠 수 있는 칸.
export const TICKET_REQUESTER_FIELDS = ['title', 'description'];
export const TICKET_OWNER_FIELDS = ['resolutionNote', 'cost'];

// status 밖의 칸을 이 사람이 지금 고칠 수 있는지. 못 고치는 칸 이름 목록을 돌려준다.
export const findForbiddenTicketFields = (ticket, actor, fields) =>
  fields.filter((field) => {
    if (TICKET_REQUESTER_FIELDS.includes(field)) return !(actor.isRequester && ticket.status === 'OPEN');
    if (TICKET_OWNER_FIELDS.includes(field)) return !actor.isActiveOwner;
    return false;
  });

// 화면이 수정 버튼을 보여줄지. 끝 상태가 아니고, 활성 소유자이거나 요청자면 무엇이든 할 수 있다(최소 취소).
export const canEditTicket = (ticket, user) => {
  if (isTicketEnded(ticket.status)) return false;
  const actor = resolveTicketActor(ticket, user);
  return actor.isActiveOwner || actor.isRequester;
};
