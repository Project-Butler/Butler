// 티켓 요청 형식 검사. 서비스까지 가기 전에 400·404로 끝나는 경우만 본다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTicket, listTickets, patchTicket, postTicket } from '../../../src/domains/tickets/controller.js';

const PROPERTY_ID = '00000000-0000-4000-8000-000000000001';
const VALID = { propertyId: PROPERTY_ID, category: 'REPAIR', title: '주방 수전에서 물이 새요', description: '싱크대 아래가 젖어요' };

const call = async (handler, req) => {
  let received;
  await handler({ params: {}, query: {}, user: { id: 'u', role: 'TENANT' }, ...req }, {}, (error) => {
    received = error;
  });
  return received;
};

const assertInvalid = (error, field) => {
  assert.equal(error?.code, 'VALIDATION_ERROR');
  assert.ok(error.details.some((item) => item.field === field), `${field} 오류가 있어야 합니다`);
};

test('만들기: 필수 칸', async () => {
  for (const field of ['propertyId', 'category', 'title', 'description']) {
    const body = { ...VALID };
    delete body[field];
    assertInvalid(await call(postTicket, { body }), field);
  }
});

test('만들기: 형식·길이·허용 칸', async () => {
  assertInvalid(await call(postTicket, { body: { ...VALID, propertyId: 'x' } }), 'propertyId');
  assertInvalid(await call(postTicket, { body: { ...VALID, category: 'PLUMBING' } }), 'category');
  assertInvalid(await call(postTicket, { body: { ...VALID, title: '가'.repeat(101) } }), 'title');
  assertInvalid(await call(postTicket, { body: { ...VALID, title: '   ' } }), 'title');
  assertInvalid(await call(postTicket, { body: { ...VALID, description: '가'.repeat(3001) } }), 'description');
  assertInvalid(await call(postTicket, { body: { ...VALID, status: 'DONE' } }), 'status');
});

test('만들기: 첨부는 UUID 배열, 최대 10개, 중복 없음', async () => {
  const ids = Array.from({ length: 11 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
  assertInvalid(await call(postTicket, { body: { ...VALID, attachmentDocumentIds: 'x' } }), 'attachmentDocumentIds');
  assertInvalid(await call(postTicket, { body: { ...VALID, attachmentDocumentIds: ['x'] } }), 'attachmentDocumentIds');
  assertInvalid(await call(postTicket, { body: { ...VALID, attachmentDocumentIds: ids } }), 'attachmentDocumentIds');
  assertInvalid(await call(postTicket, { body: { ...VALID, attachmentDocumentIds: [ids[0], ids[0]] } }), 'attachmentDocumentIds');
});

test('수정: 빈 바디·모르는 칸·값 형식', async () => {
  const patch = (body) => call(patchTicket, { params: { ticketId: PROPERTY_ID }, body });
  assertInvalid(await patch({}), 'body');
  assertInvalid(await patch({ category: 'OTHER' }), 'category');
  assertInvalid(await patch({ status: 'CLOSED' }), 'status');
  assertInvalid(await patch({ cost: -1 }), 'cost');
  assertInvalid(await patch({ cost: 1.5 }), 'cost');
  assertInvalid(await patch({ resolutionNote: '가'.repeat(3001) }), 'resolutionNote');
  assertInvalid(await patch({ title: null }), 'title');
});

test('경로 id가 UUID가 아니면 404 TICKET_NOT_FOUND', async () => {
  assert.equal((await call(getTicket, { params: { ticketId: 'abc' } }))?.code, 'TICKET_NOT_FOUND');
  assert.equal((await call(patchTicket, { params: { ticketId: 'abc' }, body: { status: 'CANCELED' } }))?.code, 'TICKET_NOT_FOUND');
});

test('목록: status·category는 쉼표 값, sort는 createdAt', async () => {
  const list = (query) => call(listTickets, { query });
  assertInvalid(await list({ status: 'OPEN,CLOSED' }), 'status');
  assertInvalid(await list({ category: 'X' }), 'category');
  assertInvalid(await list({ sort: 'title:asc' }), 'sort');
  assertInvalid(await list({ propertyId: 'x' }), 'propertyId');
  assertInvalid(await list({ size: '101' }), 'size');
});
