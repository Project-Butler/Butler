// 요청 형식 검사(R-01·R-02). 서비스까지 가기 전에 400으로 끝나는 경우만 본다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { patchManagementLog, postPropertyManagementLog } from '../../../src/domains/managementLogs/controller.js';

const PROPERTY_ID = '00000000-0000-4000-8000-000000000001';
const VALID = { type: 'REPAIR', title: '제목', occurredOn: '2026-11-02' };

const callPost = async (body) => {
  let received;
  await postPropertyManagementLog({ params: { propertyId: PROPERTY_ID }, body, user: { id: 'u' } }, {}, (error) => {
    received = error;
  });
  return received;
};

const assertInvalid = (error, field, reason) => {
  assert.equal(error?.code, 'VALIDATION_ERROR');
  const detail = error.details.find((item) => item.field === field);
  assert.ok(detail, `${field} 오류가 있어야 합니다`);
  if (reason) assert.equal(detail.reason, reason);
};

test('R-01: 제목 101자 → 400', async () => {
  assertInvalid(await callPost({ ...VALID, title: '가'.repeat(101) }), 'title');
});

test('R-01: 시스템 유형 TICKET_SUMMARY는 요청으로 못 쓴다', async () => {
  assertInvalid(await callPost({ ...VALID, type: 'TICKET_SUMMARY' }), 'type');
});

test('R-01: 날짜·비용·내용 형식', async () => {
  assertInvalid(await callPost({ ...VALID, occurredOn: '2026-02-30' }), 'occurredOn');
  assertInvalid(await callPost({ ...VALID, cost: -1 }), 'cost');
  assertInvalid(await callPost({ ...VALID, content: '가'.repeat(5001) }), 'content');
  assertInvalid(await callPost({ ...VALID, scope: 'PUBLIC' }), 'scope');
});

test('D-10: 오래된 날짜도 형식이 맞으면 형식 검사를 통과한다', async () => {
  // 서비스까지 가면 DB 오류가 나므로 occurredOn 오류가 없는지만 본다(다른 칸을 틀리게 해 400에서 멈춘다).
  const error = await callPost({ ...VALID, occurredOn: '1998-05-01', title: '' });
  assertInvalid(error, 'title');
  assert.equal(error.details.some((item) => item.field === 'occurredOn'), false);
});

test('R-02: 첨부는 받지 않는다', async () => {
  assertInvalid(await callPost({ ...VALID, attachmentDocumentIds: ['x'] }), 'attachmentDocumentIds', 'ATTACHMENTS_NOT_SUPPORTED');
});

test('수정: scope는 바꿀 수 없고 필수 칸을 비울 수 없다', async () => {
  const callPatch = async (body) => {
    let received;
    await patchManagementLog({ params: { logId: PROPERTY_ID }, body, user: { id: 'u' } }, {}, (error) => {
      received = error;
    });
    return received;
  };
  assertInvalid(await callPatch({ scope: 'PRIVATE' }), 'scope');
  assertInvalid(await callPatch({ title: null }), 'title');
  assert.equal((await callPatch({})).code, 'VALIDATION_ERROR');
});
