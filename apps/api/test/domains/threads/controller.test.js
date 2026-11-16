// 소통 요청 형식 검사. 서비스까지 가기 전에 400·404로 끝나는 경우만 본다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getThread,
  listMessages,
  listThreads,
  postMessage,
  postThread,
  postThreadRead,
} from '../../../src/domains/threads/controller.js';

const ID = '00000000-0000-4000-8000-000000000001';

const call = async (handler, req) => {
  let received;
  await handler({ params: {}, query: {}, body: {}, user: { id: 'u', role: 'TENANT' }, ...req }, {}, (error) => {
    received = error;
  });
  return received;
};

const assertInvalid = (error, field) => {
  assert.equal(error?.code, 'VALIDATION_ERROR');
  assert.ok(error.details.some((item) => item.field === field), `${field} 오류가 있어야 합니다`);
};

test('스레드 만들기: contextType은 CONTRACT·TICKET, contextId는 UUID, 다른 칸은 받지 않는다', async () => {
  assertInvalid(await call(postThread, { body: { contextType: 'PROPERTY', contextId: ID } }), 'contextType');
  assertInvalid(await call(postThread, { body: { contextType: 'CONTRACT', contextId: 'x' } }), 'contextId');
  assertInvalid(await call(postThread, { body: { contextType: 'CONTRACT', contextId: ID, userId: ID } }), 'userId');
});

test('스레드 목록: 필터 형식', async () => {
  assertInvalid(await call(listThreads, { query: { contextType: 'X' } }), 'contextType');
  assertInvalid(await call(listThreads, { query: { contextId: 'x' } }), 'contextId');
});

test('경로 id가 UUID가 아니면 404 THREAD_NOT_FOUND', async () => {
  const params = { threadId: 'abc' };
  assert.equal((await call(getThread, { params }))?.code, 'THREAD_NOT_FOUND');
  assert.equal((await call(listMessages, { params }))?.code, 'THREAD_NOT_FOUND');
  assert.equal((await call(postMessage, { params, body: { body: '안녕하세요' } }))?.code, 'THREAD_NOT_FOUND');
  assert.equal((await call(postThreadRead, { params, body: { lastReadMessageId: ID } }))?.code, 'THREAD_NOT_FOUND');
});

test('메시지 목록: size 1~100, 커서 형식, cursor와 after는 함께 못 쓴다', async () => {
  const list = (query) => call(listMessages, { params: { threadId: ID }, query });
  assertInvalid(await list({ size: '0' }), 'size');
  assertInvalid(await list({ size: '101' }), 'size');
  assertInvalid(await list({ cursor: 'not-a-cursor' }), 'cursor');
  assertInvalid(await list({ after: 'x' }), 'after');
  const cursor = Buffer.from(`2026-11-12T00:00:00.000Z|${ID}`).toString('base64url');
  assertInvalid(await list({ cursor, after: ID }), 'after');
});

test('메시지 보내기: 내용 2,000자, 내용 없으면 첨부 필요, 첨부 최대 5개', async () => {
  const send = (body) => call(postMessage, { params: { threadId: ID }, body });
  const ids = Array.from({ length: 6 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
  assertInvalid(await send({ body: '가'.repeat(2001) }), 'body');
  assertInvalid(await send({ body: '   ' }), 'body');
  assertInvalid(await send({}), 'body');
  assertInvalid(await send({ body: 1 }), 'body');
  assertInvalid(await send({ body: '사진', attachmentDocumentIds: ids }), 'attachmentDocumentIds');
  assertInvalid(await send({ body: '사진', attachmentDocumentIds: [ids[0], ids[0]] }), 'attachmentDocumentIds');
});

test('읽음: lastReadMessageId는 UUID', async () => {
  assertInvalid(await call(postThreadRead, { params: { threadId: ID }, body: { lastReadMessageId: 'x' } }), 'lastReadMessageId');
});
