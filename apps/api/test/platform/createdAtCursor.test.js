import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeCreatedAtCursor, encodeCreatedAtCursor, toCursorPage } from '../../src/platform/createdAtCursor.js';

const ID = '7d1f5f0e-1c2b-4a3d-9e8f-0a1b2c3d4e5f';

test('인코딩한 커서를 그대로 되돌린다', () => {
  const createdAt = new Date('2026-11-01T03:04:05.678Z');
  assert.deepEqual(decodeCreatedAtCursor(encodeCreatedAtCursor({ createdAt, id: ID })), { createdAt, id: ID });
});

test('형식이 틀린 커서는 null', () => {
  assert.equal(decodeCreatedAtCursor('not-a-cursor'), null);
  assert.equal(decodeCreatedAtCursor(Buffer.from(`invalid-date|${ID}`).toString('base64url')), null);
  assert.equal(decodeCreatedAtCursor(Buffer.from('2026-11-01T00:00:00.000Z|abc').toString('base64url')), null);
});

test('size보다 많이 읽었으면 마지막 항목으로 다음 커서를 만든다', () => {
  const rows = [1, 2, 3].map((n) => ({ id: ID, createdAt: new Date(`2026-11-0${n}T00:00:00.000Z`) }));
  const page = toCursorPage(rows, 2);
  assert.equal(page.items.length, 2);
  assert.equal(page.meta.hasNext, true);
  assert.deepEqual(decodeCreatedAtCursor(page.meta.nextCursor), { createdAt: rows[1].createdAt, id: ID });
  assert.deepEqual(toCursorPage(rows, 3).meta, { nextCursor: null, hasNext: false });
});
