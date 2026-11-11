// 문서를 붙이는 리소스별 권한 확인 목록 단위 테스트. DB를 쓰지 않는다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_LOG_ATTACHMENTS } from '../../../src/domains/documents/fileRules.js';
import { getResourcePolicy, SUPPORTED_RESOURCE_TYPES } from '../../../src/domains/documents/resourcePolicies.js';

test('지금은 MANAGEMENT_LOG·CONTRACT만 붙일 수 있고, 모르는 resourceType은 null', () => {
  assert.deepEqual(SUPPORTED_RESOURCE_TYPES, ['MANAGEMENT_LOG', 'CONTRACT']);
  assert.equal(getResourcePolicy('TICKET'), null);
  assert.equal(getResourcePolicy(undefined), null);
});

test('MANAGEMENT_LOG 정책: 조회·잠금 함수, 상한 10, 없으면 MANAGEMENT_LOG_NOT_FOUND', () => {
  const policy = getResourcePolicy('MANAGEMENT_LOG');
  assert.equal(typeof policy.canView, 'function');
  assert.equal(typeof policy.lockForWrite, 'function');
  assert.equal(policy.maxAttachments, MAX_LOG_ATTACHMENTS);
  assert.throws(() => policy.throwNotFound(), (error) => error.code === 'MANAGEMENT_LOG_NOT_FOUND' && error.httpStatus === 404);
});

test('MANAGEMENT_LOG 정책의 documentWhere는 조건 없음(붙은 문서 전부)', async () => {
  assert.deepEqual(await getResourcePolicy('MANAGEMENT_LOG').documentWhere({ id: 'u' }, 'r'), {});
});

test('CONTRACT 정책: 조회·문서 조건·잠금 함수, 상한 30, 없으면 CONTRACT_NOT_FOUND', () => {
  const policy = getResourcePolicy('CONTRACT');
  assert.equal(typeof policy.canView, 'function');
  assert.equal(typeof policy.documentWhere, 'function');
  assert.equal(typeof policy.lockForWrite, 'function');
  assert.equal(policy.maxAttachments, 30);
  assert.throws(() => policy.throwNotFound(), (error) => error.code === 'CONTRACT_NOT_FOUND' && error.httpStatus === 404);
});
