// 서류 종류·허용 목록 단위 테스트. DB를 쓰지 않는다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONTRACT_DOCUMENT_TYPES, DOCUMENT_TYPES, isAuditedDownload, OWNERSHIP_DOCUMENT_TYPES, parseDownloadUrlBody } from '../../../src/domains/documents/fileRules.js';

test('기존 서류 종류 4개는 그대로고 5개가 늘었다', () => {
  for (const type of ['CONTRACT_DOCUMENT', 'REGISTRY_CERTIFICATE', 'PHOTO', 'OTHER']) assert.ok(DOCUMENT_TYPES.includes(type));
  for (const type of ['SALE_CONTRACT', 'INSURANCE', 'LEASE_REPORT', 'RECEIPT', 'MOVE_PHOTO']) assert.ok(DOCUMENT_TYPES.includes(type));
  assert.equal(DOCUMENT_TYPES.length, 9);
});

test('리소스별 허용 목록은 계획 3-1 표와 같고 DOCUMENT_TYPES의 부분집합', () => {
  assert.deepEqual(OWNERSHIP_DOCUMENT_TYPES, ['REGISTRY_CERTIFICATE', 'SALE_CONTRACT', 'INSURANCE', 'OTHER']);
  assert.deepEqual(CONTRACT_DOCUMENT_TYPES, ['CONTRACT_DOCUMENT', 'LEASE_REPORT', 'RECEIPT', 'MOVE_PHOTO', 'OTHER']);
  for (const type of [...OWNERSHIP_DOCUMENT_TYPES, ...CONTRACT_DOCUMENT_TYPES]) assert.ok(DOCUMENT_TYPES.includes(type), type);
});

test('isAuditedDownload: 서류함 리소스는 종류와 상관없이, 그 밖은 계약서·등기부만', () => {
  assert.equal(isAuditedDownload({ type: 'OTHER', resourceType: 'OWNERSHIP' }), true);
  assert.equal(isAuditedDownload({ type: 'RECEIPT', resourceType: 'CONTRACT' }), true);
  assert.equal(isAuditedDownload({ type: 'PHOTO', resourceType: 'MANAGEMENT_LOG' }), false);
  assert.equal(isAuditedDownload({ type: 'REGISTRY_CERTIFICATE', resourceType: 'MANAGEMENT_LOG' }), true);
  assert.equal(isAuditedDownload({ type: 'PHOTO', resourceType: null }), false);
});

test('isAuditedDownload: 사진의 썸네일 주소는 감사하지 않고, 사진이 아니거나 VIEW면 그대로 감사한다', () => {
  const photo = { type: 'MOVE_PHOTO', resourceType: 'CONTRACT', mimeType: 'image/jpeg' };
  const pdf = { type: 'CONTRACT_DOCUMENT', resourceType: 'CONTRACT', mimeType: 'application/pdf' };
  assert.equal(isAuditedDownload(photo, { purpose: 'THUMBNAIL' }), false);
  assert.equal(isAuditedDownload(photo, { purpose: 'VIEW' }), true);
  assert.equal(isAuditedDownload(photo), true);
  assert.equal(isAuditedDownload(pdf, { purpose: 'THUMBNAIL' }), true);
  assert.equal(isAuditedDownload({ type: 'REGISTRY_CERTIFICATE', resourceType: 'MANAGEMENT_LOG', mimeType: 'image/png' }, { purpose: 'THUMBNAIL' }), false);
});

test('parseDownloadUrlBody: 바디가 없거나 {}면 VIEW, purpose는 VIEW·THUMBNAIL만, 다른 필드는 400', () => {
  assert.deepEqual(parseDownloadUrlBody(undefined), { purpose: 'VIEW' });
  assert.deepEqual(parseDownloadUrlBody({}), { purpose: 'VIEW' });
  assert.deepEqual(parseDownloadUrlBody({ purpose: 'THUMBNAIL' }), { purpose: 'THUMBNAIL' });
  assert.deepEqual(parseDownloadUrlBody({ purpose: 'VIEW' }), { purpose: 'VIEW' });
  assert.throws(() => parseDownloadUrlBody({ purpose: 'thumbnail' }), (error) => error.code === 'VALIDATION_ERROR' && error.httpStatus === 400);
  assert.throws(() => parseDownloadUrlBody({ purpose: 'THUMBNAIL', size: 1 }), (error) => error.code === 'VALIDATION_ERROR');
});
