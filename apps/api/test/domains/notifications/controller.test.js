// 알림 목록 쿼리 검사와 응답 모양(DB 없음).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseListQuery } from '../../../src/domains/notifications/controller.js';
import { encodeCreatedAtCursor } from '../../../src/platform/createdAtCursor.js';
import { NOTIFICATION_TYPES, notify, toNotificationResponse } from '../../../src/platform/notify.js';

const ID = '00000000-0000-4000-8000-000000000001';

const fieldsOf = (fn) => {
  try {
    fn();
  } catch (error) {
    assert.equal(error.code, 'VALIDATION_ERROR');
    return error.details.map((detail) => detail.field);
  }
  assert.fail('VALIDATION_ERROR가 나야 합니다');
};

test('기본값: size 30, unreadOnly false, cursor 없음', () => {
  assert.deepEqual(parseListQuery({}), { size: 30, unreadOnly: false, cursor: undefined });
});

test('unreadOnly=true, 커서 해독', () => {
  const createdAt = new Date('2026-11-11T00:00:00.000Z');
  const parsed = parseListQuery({ unreadOnly: 'true', size: '100', cursor: encodeCreatedAtCursor({ createdAt, id: ID }) });
  assert.equal(parsed.unreadOnly, true);
  assert.equal(parsed.size, 100);
  assert.deepEqual(parsed.cursor, { createdAt, id: ID });
});

test('잘못된 값은 필드별로 모아 400', () => {
  assert.deepEqual(fieldsOf(() => parseListQuery({ size: '1.5', unreadOnly: '1', cursor: 'xx' })), ['size', 'unreadOnly', 'cursor']);
  assert.deepEqual(fieldsOf(() => parseListQuery({ size: '101' })), ['size']);
  assert.deepEqual(fieldsOf(() => parseListQuery({ size: ['1', '2'] })), ['size']);
});

test('응답 모양: related는 둘 다 있을 때 객체, 없으면 null', () => {
  const createdAt = new Date('2026-11-11T01:02:03.000Z');
  const base = { id: ID, type: 'TENANT_INVITATION_ACCEPTED', title: 't', body: 'b', link: null, readAt: null, createdAt };
  assert.deepEqual(toNotificationResponse({ ...base, relatedType: null, relatedId: null }), {
    id: ID,
    type: 'TENANT_INVITATION_ACCEPTED',
    title: 't',
    body: 'b',
    link: null,
    related: null,
    readAt: null,
    createdAt: '2026-11-11T01:02:03.000Z',
  });
  assert.deepEqual(toNotificationResponse({ ...base, relatedType: 'CONTRACT', relatedId: ID, readAt: createdAt }).related, {
    resourceType: 'CONTRACT',
    resourceId: ID,
  });
});

test('notify: 등록한 type만 받는다', () => {
  assert.equal(NOTIFICATION_TYPES.TENANT_INVITATION_ACCEPTED, 'TENANT_INVITATION_ACCEPTED');
  assert.equal(NOTIFICATION_TYPES.TENANT_INVITATION_VERIFY_FAILED, 'TENANT_INVITATION_VERIFY_FAILED');
  const fake = { notification: { create: ({ data }) => data } };
  assert.throws(() => notify(fake, { userId: ID, type: 'UNKNOWN_TYPE', title: 't', body: 'b' }));
  assert.deepEqual(notify(fake, { userId: ID, type: 'TENANT_INVITATION_ACCEPTED', title: 't', body: 'b', related: { resourceType: 'CONTRACT', resourceId: ID } }), {
    userId: ID,
    type: 'TENANT_INVITATION_ACCEPTED',
    title: 't',
    body: 'b',
    link: null,
    relatedType: 'CONTRACT',
    relatedId: ID,
  });
});
