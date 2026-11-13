// 티켓 규칙(상태 전이·칸 권한) 단위 테스트. DB를 쓰지 않는다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canEditTicket,
  checkTicketTransition,
  findForbiddenTicketFields,
  resolveTicketActor,
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
