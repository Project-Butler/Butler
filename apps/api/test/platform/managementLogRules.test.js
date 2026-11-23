import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canDeleteLog, canEditLog, isHideOnlyLog, resolveCreateScope, toVisibleLogWhere } from '../../src/platform/managementLogRules.js';

const NOW = new Date('2026-11-02T00:00:00Z');
const PAST = new Date('2026-01-01T00:00:00Z');
const FUTURE = new Date('2027-01-01T00:00:00Z');
const user = { id: 'me', role: 'LANDLORD' };

const ownership = (overrides = {}) => ({
  id: 'o1',
  userId: 'me',
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
  const [scopeWhere, hideWhere] = where.AND;
  assert.deepEqual(scopeWhere.OR[0].ownershipId.in, ['verified', 'unverified', 'expired', 'ended']);
  assert.deepEqual(scopeWhere.OR[1], { scope: 'PROPERTY_HISTORY', propertyId: { in: ['pv'] } });
  // 내가 숨긴 기록은 빼되, 지금 인증된 활성 소유 호실의 숨김은 무시한다(H-41).
  assert.deepEqual(hideWhere, { OR: [{ hides: { none: { userId: 'me' } } }, { propertyId: { in: ['pv'] } }] });
});

test('보이는 범위(H-41): 목록에서 지운 소유 관계는 빼고, 인증 활성 호실이 없으면 숨김만 거른다', () => {
  const where = toVisibleLogWhere(user, [ownership({ id: 'sold', endedAt: PAST }), ownership({ id: 'removed', endedAt: PAST, removedAt: PAST })], NOW);
  const [scopeWhere, hideWhere] = where.AND;
  assert.deepEqual(scopeWhere.OR[0].ownershipId.in, ['sold']);
  assert.deepEqual(scopeWhere.OR[1].propertyId.in, []);
  assert.deepEqual(hideWhere, { hides: { none: { userId: 'me' } } });
});

test('수정 가능: 나만 보기는 작성자 + 활성이면 된다', () => {
  assert.equal(canEditLog({ authorId: 'me', scope: 'PRIVATE', ownership: ownership() }, user, NOW), true);
  assert.equal(canEditLog({ authorId: 'other', scope: 'PRIVATE', ownership: ownership() }, user, NOW), false);
  assert.equal(canEditLog({ authorId: null, scope: 'PRIVATE', ownership: ownership() }, user, NOW), false);
});

test('수정 가능: 호실 이력은 인증이 끊기면 안 된다(D-16)', () => {
  const log = (fields) => ({ authorId: 'me', scope: 'PROPERTY_HISTORY', ownership: ownership(fields) });
  assert.equal(canEditLog(log({ verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE }), user, NOW), true);
  assert.equal(canEditLog(log({ verificationStatus: 'VERIFIED', verificationExpiresAt: PAST }), user, NOW), false);
  assert.equal(canEditLog(log({ verificationStatus: 'REVOKED' }), user, NOW), false);
});

const VERIFIED = { verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE };
const LAPSED = { verificationStatus: 'VERIFIED', verificationExpiresAt: PAST };

test('수정 가능(H-41): 끝난 내 소유 관계는 내 나만 보기 기록만, 넘어간 호실 이력·요약·지운 관계는 안 된다', () => {
  const ended = (scope, fields = {}, extra = {}) => ({
    authorId: 'me',
    type: 'NOTE',
    scope,
    ownership: ownership({ ...VERIFIED, endedAt: PAST, ...fields }),
    ...extra,
  });
  assert.equal(canEditLog(ended('PRIVATE'), user, NOW), true);
  assert.equal(canEditLog(ended('PRIVATE', { removedAt: PAST }), user, NOW), false);
  assert.equal(canEditLog(ended('PRIVATE', {}, { authorId: 'other' }), user, NOW), false);
  assert.equal(canEditLog(ended('PROPERTY_HISTORY'), user, NOW), false);
  assert.equal(canEditLog(ended('PROPERTY_HISTORY', {}, { authorId: null, type: 'TICKET_SUMMARY' }), user, NOW), false);
});

test('공개 범위(H-29): 유형 3 × 인증 2 + keepPrivate', () => {
  const resolve = (type, verified, extra = {}) => resolveCreateScope({ type, verified, ...extra });
  // 인증 전: 모두 나만 보기. 메모의 체크는 keepPrivate로 남긴다.
  assert.deepEqual(resolve('REPAIR', false), { scope: 'PRIVATE', keepPrivate: false });
  assert.deepEqual(resolve('INSPECTION', false), { scope: 'PRIVATE', keepPrivate: false });
  assert.deepEqual(resolve('NOTE', false), { scope: 'PRIVATE', keepPrivate: false });
  assert.deepEqual(resolve('NOTE', false, { keepPrivate: true }), { scope: 'PRIVATE', keepPrivate: true });
  // 인증 뒤: 수리·점검은 호실 이력 고정, 메모는 체크하지 않으면 호실 이력.
  assert.deepEqual(resolve('REPAIR', true), { scope: 'PROPERTY_HISTORY', keepPrivate: false });
  assert.deepEqual(resolve('INSPECTION', true), { scope: 'PROPERTY_HISTORY', keepPrivate: false });
  assert.deepEqual(resolve('NOTE', true), { scope: 'PROPERTY_HISTORY', keepPrivate: false });
  assert.deepEqual(resolve('NOTE', true, { keepPrivate: true }), { scope: 'PRIVATE', keepPrivate: true });
});

test('공개 범위: 거절 조합', () => {
  assert.deepEqual(resolveCreateScope({ type: 'REPAIR', verified: true, requestedScope: 'PRIVATE' }), { error: 'SCOPE_NOT_ALLOWED' });
  assert.deepEqual(resolveCreateScope({ type: 'INSPECTION', verified: true, keepPrivate: true }), { error: 'SCOPE_NOT_ALLOWED' });
  assert.deepEqual(resolveCreateScope({ type: 'NOTE', verified: true, keepPrivate: true, requestedScope: 'PROPERTY_HISTORY' }), {
    error: 'INVALID_COMBINATION',
  });
  assert.deepEqual(resolveCreateScope({ type: 'NOTE', verified: false, requestedScope: 'PROPERTY_HISTORY' }), {
    error: 'VERIFICATION_REQUIRED',
  });
  // 인증 전에는 수리를 PRIVATE로 요청해도 된다(어차피 나만 보기). 나만 보기 뜻은 남기지 않는다.
  assert.deepEqual(resolveCreateScope({ type: 'REPAIR', verified: false, requestedScope: 'PRIVATE', keepPrivate: true }), {
    scope: 'PRIVATE',
    keepPrivate: false,
  });
  // 메모를 PRIVATE로 직접 요청하면 나만 보기를 고른 것으로 본다.
  assert.deepEqual(resolveCreateScope({ type: 'NOTE', verified: true, requestedScope: 'PRIVATE' }), { scope: 'PRIVATE', keepPrivate: true });
});

test('수정 가능: 수리 요청 완료 요약은 인증된 활성 소유자(H-47)', () => {
  const summary = (fields, userId = 'me') => ({ authorId: null, type: 'TICKET_SUMMARY', scope: 'PROPERTY_HISTORY', ownership: ownership({ userId, ...fields }) });
  assert.equal(canEditLog(summary(VERIFIED), user, NOW), true);
  assert.equal(canEditLog(summary(LAPSED), user, NOW), false);
  assert.equal(canEditLog(summary({}), user, NOW), false);
  assert.equal(canEditLog(summary({ ...VERIFIED, endedAt: PAST }), user, NOW), false);
  assert.equal(canEditLog(summary(VERIFIED, 'other'), user, NOW), false);
});

test('삭제 가능(H-36·H-47·D-13)', () => {
  const log = (scope, fields, extra = {}) => ({ authorId: 'me', type: 'REPAIR', scope, ownership: ownership(fields), ...extra });
  // 작성자 + 활성: 나만 보기는 늘, 호실 이력은 인증 상태일 때만.
  assert.equal(canDeleteLog(log('PRIVATE', {}), user, NOW), true);
  assert.equal(canDeleteLog(log('PROPERTY_HISTORY', VERIFIED), user, NOW), true);
  assert.equal(canDeleteLog(log('PROPERTY_HISTORY', LAPSED), user, NOW), false);
  // 끝난 소유 관계: 나만 보기는 지우고(D-13), 호실 이력은 숨긴다(H-41 — 삭제 가능으로 본다).
  assert.equal(canDeleteLog(log('PRIVATE', { ...VERIFIED, endedAt: PAST }), user, NOW), true);
  assert.equal(canDeleteLog(log('PROPERTY_HISTORY', { ...VERIFIED, endedAt: PAST }), user, NOW), true);
  // 남이 쓴 기록은 못 지운다.
  assert.equal(canDeleteLog(log('PROPERTY_HISTORY', VERIFIED, { authorId: 'other' }), user, NOW), false);
  // 수리 요청 완료 요약: 인증된 활성 소유자만.
  const summary = (fields) => log('PROPERTY_HISTORY', fields, { authorId: null, type: 'TICKET_SUMMARY' });
  assert.equal(canDeleteLog(summary(VERIFIED), user, NOW), true);
  assert.equal(canDeleteLog(summary(LAPSED), user, NOW), false);
  assert.equal(canDeleteLog(summary({ ...VERIFIED, endedAt: PAST }), user, NOW), true);
  // 넘겨받은 기록(남의 소유 관계)은 지울 수도 숨길 수도 없다.
  assert.equal(canDeleteLog(log('PROPERTY_HISTORY', { ...VERIFIED, userId: 'seller', endedAt: PAST }, { authorId: 'seller' }), user, NOW), false);
});

test('숨김만 되는 기록(H-41): 끝난 내 소유 관계의 호실 이력·요약', () => {
  const log = (scope, fields, extra = {}) => ({ authorId: 'me', type: 'REPAIR', scope, ownership: ownership(fields), ...extra });
  assert.equal(isHideOnlyLog(log('PROPERTY_HISTORY', { endedAt: PAST }), user), true);
  assert.equal(isHideOnlyLog(log('PRIVATE', { endedAt: PAST }, { authorId: null, type: 'TICKET_SUMMARY' }), user), true);
  assert.equal(isHideOnlyLog(log('PRIVATE', { endedAt: PAST }), user), false);
  assert.equal(isHideOnlyLog(log('PROPERTY_HISTORY', {}), user), false);
  assert.equal(isHideOnlyLog(log('PROPERTY_HISTORY', { userId: 'seller', endedAt: PAST }), user), false);
});
