// 티켓 규칙(상태 전이·칸 권한·알림·완료 제목) 단위 테스트. DB를 쓰지 않는다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NOTIFICATION_TYPES } from '../../src/platform/notify.js';
import { ROOM_LABELS } from '../../src/platform/roomRules.js';
import {
  buildTicketNotification,
  buildTicketSummaryTitle,
  canEditTicket,
  checkTicketTransition,
  findForbiddenTicketFields,
  resolveTicketActor,
  resolveTicketNotificationRecipient,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
} from '../../src/platform/ticketRules.js';

const OWNER = { id: 'owner' };
const TENANT = { id: 'tenant' };
const STRANGER = { id: 'stranger' };
const ticketOf = (overrides = {}) => ({
  status: 'OPEN',
  requesterId: TENANT.id,
  ownership: { userId: OWNER.id, endedAt: null },
  ...overrides,
});

const ownerActor = { isOwner: true, isActiveOwner: true, isRequester: false };
const requesterActor = { isOwner: false, isActiveOwner: false, isRequester: true };
const formerOwnerActor = { isOwner: true, isActiveOwner: false, isRequester: false };

test('관계 판단: 활성 소유자·요청자·소유가 끝난 소유자', () => {
  assert.deepEqual(resolveTicketActor(ticketOf(), OWNER), ownerActor);
  assert.deepEqual(resolveTicketActor(ticketOf(), TENANT), requesterActor);
  assert.deepEqual(resolveTicketActor(ticketOf({ ownership: { userId: OWNER.id, endedAt: new Date() } }), OWNER), formerOwnerActor);
  assert.deepEqual(resolveTicketActor(ticketOf(), STRANGER), { isOwner: false, isActiveOwner: false, isRequester: false });
});

test('상태 전이: 허용된 길만', () => {
  for (const next of ['IN_PROGRESS', 'DONE', 'CANCELED']) assert.equal(checkTicketTransition('OPEN', next, ownerActor), 'OK');
  for (const next of ['DONE', 'CANCELED']) assert.equal(checkTicketTransition('IN_PROGRESS', next, ownerActor), 'OK');
  assert.equal(checkTicketTransition('IN_PROGRESS', 'OPEN', ownerActor), 'INVALID_TRANSITION');
  assert.equal(checkTicketTransition('DONE', 'CANCELED', ownerActor), 'INVALID_TRANSITION');
  assert.equal(checkTicketTransition('CANCELED', 'OPEN', ownerActor), 'INVALID_TRANSITION');
});

test('상태 전이: 요청자는 취소만, 소유가 끝난 소유자는 아무것도', () => {
  assert.equal(checkTicketTransition('OPEN', 'CANCELED', requesterActor), 'OK');
  assert.equal(checkTicketTransition('IN_PROGRESS', 'CANCELED', requesterActor), 'OK');
  assert.equal(checkTicketTransition('OPEN', 'IN_PROGRESS', requesterActor), 'FORBIDDEN');
  assert.equal(checkTicketTransition('OPEN', 'DONE', requesterActor), 'FORBIDDEN');
  assert.equal(checkTicketTransition('OPEN', 'CANCELED', formerOwnerActor), 'FORBIDDEN');
});

test('칸 권한: 요청자는 OPEN일 때 제목·설명, 활성 소유자는 처리 내용·비용', () => {
  assert.deepEqual(findForbiddenTicketFields(ticketOf(), requesterActor, ['title', 'description']), []);
  assert.deepEqual(findForbiddenTicketFields(ticketOf({ status: 'IN_PROGRESS' }), requesterActor, ['title']), ['title']);
  assert.deepEqual(findForbiddenTicketFields(ticketOf(), requesterActor, ['cost', 'resolutionNote']), ['cost', 'resolutionNote']);
  assert.deepEqual(findForbiddenTicketFields(ticketOf(), ownerActor, ['cost', 'resolutionNote']), []);
  assert.deepEqual(findForbiddenTicketFields(ticketOf(), ownerActor, ['title']), ['title']);
  assert.deepEqual(findForbiddenTicketFields(ticketOf(), formerOwnerActor, ['cost']), ['cost']);
});

test('수정 가능 여부: 끝 상태는 아무도, 그 밖에는 활성 소유자·요청자', () => {
  assert.equal(canEditTicket(ticketOf(), OWNER), true);
  assert.equal(canEditTicket(ticketOf({ status: 'IN_PROGRESS' }), TENANT), true);
  assert.equal(canEditTicket(ticketOf({ status: 'DONE' }), OWNER), false);
  assert.equal(canEditTicket(ticketOf({ status: 'CANCELED' }), TENANT), false);
  assert.equal(canEditTicket(ticketOf(), STRANGER), false);
  assert.equal(canEditTicket(ticketOf({ ownership: { userId: OWNER.id, endedAt: new Date() } }), OWNER), false);
});

test('칸 권한: 방은 요청자(OPEN일 때)와 활성 소유자가 고친다(H-20)', () => {
  assert.deepEqual(findForbiddenTicketFields(ticketOf(), requesterActor, ['room']), []);
  assert.deepEqual(findForbiddenTicketFields(ticketOf({ status: 'IN_PROGRESS' }), requesterActor, ['room']), ['room']);
  assert.deepEqual(findForbiddenTicketFields(ticketOf({ status: 'IN_PROGRESS' }), ownerActor, ['room']), []);
  assert.deepEqual(findForbiddenTicketFields(ticketOf(), formerOwnerActor, ['room']), ['room']);
});

// 서버 라벨 표. 화면 표(butler shared/room.js·shared/ticketLabels.js)도 같은 리터럴로 단언한다(분류·방은 같은 값, 상태는 화면이 역할별로 다름).
test('서버 라벨 표: 분류·방은 화면과 같은 값, 상태는 서버 문구', () => {
  assert.deepEqual(TICKET_CATEGORY_LABELS, { REPAIR: '수리', INSPECTION: '점검', OTHER: '기타' });
  assert.deepEqual(ROOM_LABELS, {
    ENTRANCE: '현관',
    LIVING: '거실',
    KITCHEN: '주방',
    BATHROOM: '욕실·화장실',
    BEDROOM: '침실',
    UTILITY: '다용도실',
    BALCONY: '베란다',
    BOILER_ROOM: '보일러실',
    OTHER: '기타',
  });
  assert.deepEqual(TICKET_STATUS_LABELS, { OPEN: '접수', IN_PROGRESS: '처리 중', DONE: '완료', CANCELED: '취소' });
});

test('완료 요약 제목: 임차인 글 없이 [방 ]유형 완료', () => {
  assert.equal(buildTicketSummaryTitle({ room: 'KITCHEN', category: 'REPAIR' }), '주방 수리 완료');
  assert.equal(buildTicketSummaryTitle({ room: null, category: 'REPAIR' }), '수리 완료');
  assert.equal(buildTicketSummaryTitle({ room: null, category: 'INSPECTION' }), '점검 완료');
  assert.equal(buildTicketSummaryTitle({ room: 'OTHER', category: 'REPAIR' }), '수리 완료');
  assert.equal(buildTicketSummaryTitle({ room: 'BATHROOM', category: 'OTHER' }), '욕실·화장실 요청 처리 완료');
  assert.equal(buildTicketSummaryTitle({ room: undefined, category: 'OTHER' }), '요청 처리 완료');
  // 요청 제목이 있어도 쓰지 않는다
  assert.equal(buildTicketSummaryTitle({ room: 'LIVING', category: 'INSPECTION', title: '임차인이 쓴 제목' }), '거실 점검 완료');
});

test('알림 받는 사람: 소유 관계 사용자 또는 요청자, 바꾼 사람 자신이면 없음', () => {
  const tenantTicket = ticketOf();
  // 임차인 생성 → 소유 관계 사용자
  assert.equal(resolveTicketNotificationRecipient(tenantTicket, TENANT, 'CREATED'), OWNER.id);
  // 임대인 직접 등록(요청자 = 소유자) → 없음. 연결된 임차인은 그 요청을 볼 수 없다
  const ownerTicket = ticketOf({ requesterId: OWNER.id });
  assert.equal(resolveTicketNotificationRecipient(ownerTicket, OWNER, 'CREATED'), null);
  // 소유자가 시작·완료·취소 → 요청자
  assert.equal(resolveTicketNotificationRecipient(tenantTicket, OWNER, 'STATUS_CHANGED'), TENANT.id);
  // 직접 등록한 요청을 소유자가 바꾸면 없음
  assert.equal(resolveTicketNotificationRecipient(ownerTicket, OWNER, 'STATUS_CHANGED'), null);
  // 임차인 취소(OPEN·IN_PROGRESS 모두 서버 허용) → 소유 관계 사용자
  assert.equal(resolveTicketNotificationRecipient(ticketOf(), TENANT, 'STATUS_CHANGED'), OWNER.id);
  assert.equal(resolveTicketNotificationRecipient(ticketOf({ status: 'IN_PROGRESS' }), TENANT, 'STATUS_CHANGED'), OWNER.id);
  // 소유가 끝난 뒤 임차인 취소 → 이전 소유자(그 소유 관계 사용자). 새 소유자는 이 티켓과 관계없다
  const endedTicket = ticketOf({ ownership: { userId: OWNER.id, endedAt: new Date('2026-01-01') } });
  assert.equal(resolveTicketNotificationRecipient(endedTicket, TENANT, 'STATUS_CHANGED'), OWNER.id);
});

test('알림 내용: 호실·방·제목·상태만, 링크는 역할 접두어 없는 상대 경로', () => {
  const ticket = { id: 't1', title: '보일러 누수', room: 'BOILER_ROOM', status: 'OPEN' };
  const created = buildTicketNotification('CREATED', ticket, '잠실엘스 108동 1502호');
  assert.equal(created.type, NOTIFICATION_TYPES.TICKET_CREATED);
  assert.equal(created.title, '새 수리 요청이 들어왔어요');
  assert.equal(created.body, '잠실엘스 108동 1502호 · 보일러실 — 보일러 누수');
  assert.equal(created.link, '/tickets/t1');
  assert.deepEqual(created.related, { resourceType: 'TICKET', resourceId: 't1' });

  const titles = ['IN_PROGRESS', 'DONE', 'CANCELED'].map(
    (status) => buildTicketNotification('STATUS_CHANGED', { ...ticket, status, room: null }, '집').title,
  );
  assert.deepEqual(titles, ['수리 요청 처리가 시작됐어요', '수리 요청이 완료됐어요', '수리 요청이 취소됐어요']);
  const changed = buildTicketNotification('STATUS_CHANGED', { ...ticket, status: 'DONE', room: null }, '집');
  assert.equal(changed.type, NOTIFICATION_TYPES.TICKET_STATUS_CHANGED);
  assert.equal(changed.body, '집 — 보일러 누수');
  // 요청자 이름·연락처·금액은 입력에 있어도 나가지 않는다
  const withExtra = buildTicketNotification(
    'STATUS_CHANGED',
    { ...ticket, status: 'DONE', cost: 120000, requester: { name: '김임차' }, tenantPhone: '01012345678' },
    '집',
  );
  const text = JSON.stringify(withExtra);
  for (const secret of ['120000', '김임차', '01012345678']) assert.equal(text.includes(secret), false, secret);
});
