// GET /admin/documents 쿼리 검사(docs/18 계획 2장).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseDocumentListQuery } from '../../../src/domains/admin/documentListQuery.js';
import { SUPPORTED_RESOURCE_TYPES } from '../../../src/domains/documents/resourcePolicies.js';

const UUID = '00000000-0000-4000-8000-000000000001';
const expectInvalid = (query, field) =>
  assert.throws(
    () => parseDocumentListQuery(query),
    (error) => error.code === 'VALIDATION_ERROR' && error.details.some((detail) => detail.field === field),
  );

describe('parseDocumentListQuery', () => {
  test('비어 있으면 모든 종류·기본 쪽', () => {
    assert.deepEqual(parseDocumentListQuery({}), { resourceTypes: null, uploaderId: null, uploaderQuery: null, from: null, until: null, page: 1, size: 20 });
  });

  test('첨부 위치는 쉼표로 여러 개, 정책 표에 있는 값만', () => {
    assert.deepEqual(parseDocumentListQuery({ resourceType: 'TICKET, RENEWAL_NOTICE,TICKET' }).resourceTypes, ['TICKET', 'RENEWAL_NOTICE']);
    assert.deepEqual(parseDocumentListQuery({ resourceType: SUPPORTED_RESOURCE_TYPES.join(',') }).resourceTypes, SUPPORTED_RESOURCE_TYPES);
    expectInvalid({ resourceType: 'OWNERSHIP_VERIFICATION' }, 'resourceType');
    expectInvalid({ resourceType: 'TICKET,PROPERTY' }, 'resourceType');
  });

  test('등록자는 UUID', () => {
    assert.equal(parseDocumentListQuery({ uploaderId: UUID }).uploaderId, UUID);
    expectInvalid({ uploaderId: 'abc' }, 'uploaderId');
  });

  test('등록자 검색어는 앞뒤 공백을 빼고 100자까지', () => {
    assert.equal(parseDocumentListQuery({ uploaderQuery: '  kim@butler  ' }).uploaderQuery, 'kim@butler');
    assert.equal(parseDocumentListQuery({ uploaderQuery: '   ' }).uploaderQuery, null);
    expectInvalid({ uploaderQuery: 'a'.repeat(101) }, 'uploaderQuery');
  });

  test('등록일은 YYYY-MM-DD, from이 until보다 늦으면 안 된다', () => {
    assert.deepEqual(
      (({ from, until }) => ({ from, until }))(parseDocumentListQuery({ from: '2026-11-01', until: '2026-11-01' })),
      { from: '2026-11-01', until: '2026-11-01' },
    );
    expectInvalid({ from: '2026-11-31' }, 'from');
    expectInvalid({ until: '2026/11/01' }, 'until');
    expectInvalid({ from: '2026-11-02', until: '2026-11-01' }, 'from');
  });

  test('같은 이름을 두 번 보내면 400', () => {
    expectInvalid({ resourceType: ['TICKET', 'CONTRACT'] }, 'resourceType');
  });

  test('쪽 번호 검사', () => {
    expectInvalid({ page: '0' }, 'page');
    expectInvalid({ size: 'x' }, 'size');
  });
});
