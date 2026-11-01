import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeAuditLogCursor, encodeAuditLogCursor } from './auditLogCursor.js';

const ID = '7d1f5f0e-1c2b-4a3d-9e8f-0a1b2c3d4e5f';

test('인코딩한 커서를 그대로 되돌린다', () => {
  const createdAt = new Date('2026-11-01T03:04:05.678Z');
  assert.deepEqual(decodeAuditLogCursor(encodeAuditLogCursor({ createdAt, id: ID })), { createdAt, id: ID });
});

test('형식이 틀린 커서는 null', () => {
  assert.equal(decodeAuditLogCursor('not-a-cursor'), null);
  assert.equal(decodeAuditLogCursor(Buffer.from(`invalid-date|${ID}`).toString('base64url')), null);
  assert.equal(decodeAuditLogCursor(Buffer.from('2026-11-01T00:00:00.000Z|abc').toString('base64url')), null);
});
