// 관리자 문서 목록의 종류 지도와 응답 변환(DB 없이). docs/18 계획 7장.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { PROPERTY_RESOLVERS, toAdminDocumentResponse, toAdminDocumentWhere } from '../../../src/domains/admin/documentList.js';
import { SUPPORTED_RESOURCE_TYPES } from '../../../src/domains/documents/resourcePolicies.js';

describe('관리자 문서 목록 — 종류 지도', () => {
  test('호실 찾기 표는 문서 정책 표의 종류와 똑같다(새 종류가 생기면 여기서 깨진다)', () => {
    assert.deepEqual(Object.keys(PROPERTY_RESOLVERS).sort(), [...SUPPORTED_RESOURCE_TYPES].sort());
  });
});

describe('toAdminDocumentWhere', () => {
  test('삭제·임시·증빙 문서를 빼고, 종류를 안 고르면 정책 표 전체', () => {
    assert.deepEqual(toAdminDocumentWhere({ resourceTypes: null, uploaderId: null, from: null, until: null }), {
      deletedAt: null,
      resourceType: { in: SUPPORTED_RESOURCE_TYPES },
      evidenceFor: { none: {} },
    });
  });

  test('등록일은 KST 하루 경계(until은 다음날 0시 전까지)', () => {
    const where = toAdminDocumentWhere({ resourceTypes: ['TICKET'], uploaderId: 'u', from: '2026-11-19', until: '2026-11-30' });
    assert.deepEqual(where.resourceType, { in: ['TICKET'] });
    assert.equal(where.uploaderId, 'u');
    assert.equal(where.createdAt.gte.toISOString(), '2026-11-18T15:00:00.000Z');
    assert.equal(where.createdAt.lt.toISOString(), '2026-11-30T15:00:00.000Z');
  });
});

describe('toAdminDocumentResponse', () => {
  const row = {
    id: 'd1', uploadId: 'up1', type: 'CONTRACT_DOCUMENT', fileName: '계약서.pdf', mimeType: 'application/pdf', sizeBytes: 2048n,
    resourceType: 'CONTRACT', resourceId: 'c1', storagePath: 'uploads/up1', isLocked: false, deletedAt: null,
    createdAt: new Date('2026-11-26T01:00:00Z'), uploader: { id: 'u1', name: '임대인', role: 'LANDLORD', email: 'x@test' },
  };

  test('허용한 칸만 내보낸다', () => {
    const response = toAdminDocumentResponse(row, { property: null, link: { type: 'CONTRACT', id: 'c1' } });
    assert.deepEqual(response, {
      id: 'd1', documentType: 'CONTRACT_DOCUMENT', fileName: '계약서.pdf', mimeType: 'application/pdf', sizeBytes: 2048,
      resourceType: 'CONTRACT', resourceId: 'c1', property: null, link: { type: 'CONTRACT', id: 'c1' },
      uploader: { id: 'u1', name: '임대인', role: 'LANDLORD' }, createdAt: '2026-11-26T01:00:00.000Z',
    });
  });

  test('첨부 위치를 못 찾으면 호실·이동 대상은 null', () => {
    const response = toAdminDocumentResponse(row, undefined);
    assert.equal(response.property, null);
    assert.equal(response.link, null);
  });
});
