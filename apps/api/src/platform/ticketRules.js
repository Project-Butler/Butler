// 티켓(수리·점검 요청) 규칙(DB 의존 없음). 계약 5장 "티켓", 10장 TicketStatus·TicketCategory.
import { NOTIFICATION_TYPES } from './notify.js';
import { ROOM_LABELS } from './roomRules.js';

// 닫힌 Enum(10장). Prisma enum TicketStatus와 같다.
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED'];
// 등록형(10장). 피처가 추가하면 여기에 넣는다.
export const TICKET_CATEGORIES = ['REPAIR', 'INSPECTION', 'OTHER'];

// 서버 문구용 라벨(에러 메시지·감사 요약·알림·하우스 로그 완료 제목). 화면 라벨은 화면 쪽 표가 따로 있다
// (분류 라벨은 같은 값, 상태는 화면이 역할마다 다르게 보여 줌 — 임대인 OPEN '확인 필요', 임차인 '접수됨').
export const TICKET_STATUS_LABELS = { OPEN: '접수', IN_PROGRESS: '처리 중', DONE: '완료', CANCELED: '취소' };
export const TICKET_CATEGORY_LABELS = { REPAIR: '수리', INSPECTION: '점검', OTHER: '기타' };

// 수리 요청이 완료될 때 하우스 로그에 남는 기본 제목. 임차인이 쓴 요청 제목은 다음 소유자에게 넘어갈 수 있어 쓰지 않는다.
// '[방 ]유형 완료' — 방이 없거나 OTHER면 방을 빼고, 유형 OTHER는 '요청 처리 완료'(예: '주방 수리 완료', '욕실·화장실 요청 처리 완료').
export const buildTicketSummaryTitle = ({ room, category }) => {
  const roomLabel = room && room !== 'OTHER' ? ROOM_LABELS[room] : null;
  const action = category === 'OTHER' || !TICKET_CATEGORY_LABELS[category] ? '요청 처리 완료' : `${TICKET_CATEGORY_LABELS[category]} 완료`;
  return roomLabel ? `${roomLabel} ${action}` : action;
};

// 알림을 받을 사람(사용자 id) 또는 null. event: 'CREATED' | 'STATUS_CHANGED'. user: 바꾼 사람.
// 받는 사람은 그 티켓의 소유 관계 사용자(ownership.userId) 한 명 또는 요청자뿐이고, 바꾼 사람 자신이면 보내지 않는다.
//  - 생성: 소유 관계 사용자에게(임대인이 직접 등록하면 본인이라 없음 — 연결된 임차인은 그 요청을 볼 수 없다).
//  - 상태 변경: 소유자가 바꾸면 요청자에게, 요청자가 바꾸면(취소) 소유 관계 사용자에게. 소유가 끝나도 그 소유 관계 사용자다.
// ticket: { requesterId, ownership: { userId } }
export const resolveTicketNotificationRecipient = (ticket, user, event) => {
  const ownerId = ticket.ownership.userId;
  const other = event === 'CREATED' || user.id !== ownerId ? ownerId : ticket.requesterId;
  return other && other !== user.id ? other : null;
};

const STATUS_CHANGED_TITLES = {
  IN_PROGRESS: '수리 요청 처리가 시작됐어요',
  DONE: '수리 요청이 완료됐어요',
  CANCELED: '수리 요청이 취소됐어요',
};

// 알림 내용(notify 입력에서 userId를 뺀 것). 호실 표시 이름·방·요청 제목·상태만 넣는다.
// 요청자 이름·연락처·계약 금액·비용은 넣지 않는다. link는 역할 접두어 없는 상대 경로(화면이 붙인다, 계약 7장).
// ticket: { id, title, room, status }(status는 바뀐 뒤 값)
export const buildTicketNotification = (event, ticket, propertyName) => {
  const place = [propertyName, ticket.room ? ROOM_LABELS[ticket.room] : null].filter(Boolean).join(' · ');
  const created = event === 'CREATED';
  return {
    type: created ? NOTIFICATION_TYPES.TICKET_CREATED : NOTIFICATION_TYPES.TICKET_STATUS_CHANGED,
    title: created ? '새 수리 요청이 들어왔어요' : (STATUS_CHANGED_TITLES[ticket.status] ?? '수리 요청 상태가 바뀌었어요'),
    body: `${place} — ${ticket.title}`,
    link: `/tickets/${ticket.id}`,
    related: { resourceType: 'TICKET', resourceId: ticket.id },
  };
};
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
    // 방은 요청자(OPEN일 때)와 활성 소유자 둘 다 고칠 수 있다.
    if (field === 'room') return !(actor.isActiveOwner || (actor.isRequester && ticket.status === 'OPEN'));
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
