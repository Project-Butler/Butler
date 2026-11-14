// 문서를 붙이는 리소스별 권한 확인 목록 단위 테스트. DB를 쓰지 않는다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_LOG_ATTACHMENTS } from '../../../src/domains/documents/fileRules.js';
import { getResourcePolicy, SUPPORTED_RESOURCE_TYPES, visibleDocumentWhere } from '../../../src/domains/documents/resourcePolicies.js';

test('지금은 MANAGEMENT_LOG·TICKET·THREAD_MESSAGE·CONTRACT만 붙일 수 있고, 모르는 resourceType은 null', () => {
  assert.deepEqual(SUPPORTED_RESOURCE_TYPES, ['MANAGEMENT_LOG', 'TICKET', 'THREAD_MESSAGE', 'CONTRACT']);
  assert.equal(getResourcePolicy('PROPERTY'), null);
  assert.equal(getResourcePolicy(undefined), null);
});

test('MANAGEMENT_LOG 정책: 조회·잠금 함수, 상한 10, 없으면 MANAGEMENT_LOG_NOT_FOUND', () => {
  const policy = getResourcePolicy('MANAGEMENT_LOG');
  assert.equal(typeof policy.canView, 'function');
  assert.equal(typeof policy.lockForWrite, 'function');
  assert.equal(policy.maxAttachments, MAX_LOG_ATTACHMENTS);
  assert.throws(() => policy.throwNotFound(), (error) => error.code === 'MANAGEMENT_LOG_NOT_FOUND' && error.httpStatus === 404);
});

test('TICKET 정책: 조회·잠금 함수, 상한 10, 없으면 TICKET_NOT_FOUND', () => {
  const policy = getResourcePolicy('TICKET');
  assert.equal(typeof policy.canView, 'function');
  assert.equal(typeof policy.lockForWrite, 'function');
  assert.equal(policy.maxAttachments, 10);
  assert.throws(() => policy.throwNotFound(), (error) => error.code === 'TICKET_NOT_FOUND' && error.httpStatus === 404);
});

test('THREAD_MESSAGE 정책: 상한 5, 없으면 MESSAGE_NOT_FOUND', () => {
  const policy = getResourcePolicy('THREAD_MESSAGE');
  assert.equal(typeof policy.canView, 'function');
  assert.equal(typeof policy.lockForWrite, 'function');
  assert.equal(policy.maxAttachments, 5);
  assert.throws(() => policy.throwNotFound(), (error) => error.code === 'MESSAGE_NOT_FOUND' && error.httpStatus === 404);
});

test('CONTRACT 정책: 조회·문서 조건·잠금 함수, 상한 30, 없으면 CONTRACT_NOT_FOUND', () => {
  const policy = getResourcePolicy('CONTRACT');
  assert.equal(typeof policy.canView, 'function');
  assert.equal(typeof policy.documentWhere, 'function');
  assert.equal(typeof policy.lockForWrite, 'function');
  assert.equal(policy.maxAttachments, 30);
  assert.throws(() => policy.throwNotFound(), (error) => error.code === 'CONTRACT_NOT_FOUND' && error.httpStatus === 404);
});

test('documentWhere가 없는 정책(관리 로그·티켓·메시지)은 붙은 문서 전부를 본다', async () => {
  for (const type of ['MANAGEMENT_LOG', 'TICKET', 'THREAD_MESSAGE']) {
    const policy = getResourcePolicy(type);
    assert.equal(policy.documentWhere, undefined);
    assert.deepEqual(await visibleDocumentWhere(policy, { id: 'u' }, 'r'), {});
  }
});
