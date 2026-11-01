import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canEditLog, toVisibleLogWhere } from './managementLogRules.js';

const NOW = new Date('2026-11-02T00:00:00Z');
const PAST = new Date('2026-01-01T00:00:00Z');
const FUTURE = new Date('2027-01-01T00:00:00Z');
const user = { id: 'me', role: 'LANDLORD' };

const ownership = (overrides = {}) => ({
  id: 'o1',
  propertyId: 'p1',
  endedAt: null,
  verificationStatus: 'UNVERIFIED',
  verificationExpiresAt: null,
  ...overrides,
});

test('보이는 범위: 운영자는 조건 없음', () => {
  assert.deepEqual(toVisibleLogWhere({ id: 'a', role: 'ADMIN' }, [], NOW), {});
});

test('보이는 범위: 인증된 활성 소유 호실만 호실 이력을 본다', () => {
  const where = toVisibleLogWhere(
    user,
    [
      ownership({ id: 'verified', propertyId: 'pv', verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE }),
      ownership({ id: 'unverified', propertyId: 'pu' }),
      ownership({ id: 'expired', propertyId: 'pe', verificationStatus: 'VERIFIED', verificationExpiresAt: PAST }),
      ownership({ id: 'ended', propertyId: 'pd', verificationStatus: 'VERIFIED', endedAt: PAST }),
    ],
    NOW,
  );
  assert.deepEqual(where.OR[0].ownershipId.in, ['verified', 'unverified', 'expired', 'ended']);
  assert.deepEqual(where.OR[1], { scope: 'PROPERTY_HISTORY', propertyId: { in: ['pv'] } });
});

test('수정 가능: 나만 보기는 작성자 + 활성이면 된다', () => {
  assert.equal(canEditLog({ authorId: 'me', scope: 'PRIVATE', ownership: ownership() }, user, NOW), true);
  assert.equal(canEditLog({ authorId: 'other', scope: 'PRIVATE', ownership: ownership() }, user, NOW), false);
  assert.equal(canEditLog({ authorId: null, scope: 'PRIVATE', ownership: ownership() }, user, NOW), false);
  assert.equal(canEditLog({ authorId: 'me', scope: 'PRIVATE', ownership: ownership({ endedAt: PAST }) }, user, NOW), false);
});

test('수정 가능: 호실 이력은 인증이 끊기면 안 된다(D-16)', () => {
  const log = (fields) => ({ authorId: 'me', scope: 'PROPERTY_HISTORY', ownership: ownership(fields) });
  assert.equal(canEditLog(log({ verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE }), user, NOW), true);
  assert.equal(canEditLog(log({ verificationStatus: 'VERIFIED', verificationExpiresAt: PAST }), user, NOW), false);
  assert.equal(canEditLog(log({ verificationStatus: 'REVOKED' }), user, NOW), false);
});
