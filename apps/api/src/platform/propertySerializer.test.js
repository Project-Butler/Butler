// Prisma.Decimal만 쓴다 — PrismaClient 인스턴스(platform/prismaClient.js)는 import하지 않는다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { resolveMyRelation, toOwnershipResponse, toPropertySummary } from './propertySerializer.js';

const NOW = new Date('2026-10-19T00:00:00Z');
const PAST = new Date('2026-10-18T00:00:00Z');
const FUTURE = new Date('2027-10-19T00:00:00Z');

const complex = { id: 'c1', name: '잠실OO아파트', regionId: '1171010100' };

const baseOwnership = {
  id: 'o1',
  userId: 'u1',
  acquiredYearMonth: null,
  purchasePrice: null,
  verificationStatus: 'UNVERIFIED',
  verifiedAt: null,
  verificationExpiresAt: null,
  startedAt: new Date('2026-10-01T00:00:00Z'),
  endedAt: null,
  endReason: null,
};

test('toPropertySummary: Decimal → number, displayName', () => {
  const summary = toPropertySummary({
    id: 'p1',
    complex,
    buildingNo: '101',
    unitNo: '1203',
    exclusiveArea: new Prisma.Decimal('84.97'),
    floor: 12,
  });
  assert.equal(summary.exclusiveArea, 84.97);
  assert.equal(typeof summary.exclusiveArea, 'number');
  assert.equal(summary.displayName, '잠실OO아파트 101동 1203호');
  assert.deepEqual(summary.complex, { id: complex.id, name: complex.name, legalDongCode: complex.regionId });
});

test('toPropertySummary: 면적은 반올림하지 않는다(39.78 그대로), 동이 없으면 표시 이름에서 뺀다', () => {
  const summary = toPropertySummary({
    id: 'p1',
    complex,
    buildingNo: '',
    unitNo: '410',
    exclusiveArea: new Prisma.Decimal('39.78'),
    floor: -1,
  });
  assert.equal(summary.exclusiveArea, 39.78);
  assert.equal(JSON.stringify({ area: summary.exclusiveArea }), '{"area":39.78}');
  assert.equal(summary.floor, -1);
  assert.equal(summary.displayName, '잠실OO아파트 410호');
});

test('toOwnershipResponse: 방 구성·설비(C9), 없으면 null·빈 배열', () => {
  const filled = toOwnershipResponse(
    { ...baseOwnership, unitType: 'ONE_ROOM', equipment: ['TV'], equipmentEtc: '건조기' },
    null,
    NOW,
  );
  assert.equal(filled.unitType, 'ONE_ROOM');
  assert.deepEqual(filled.equipment, ['TV']);
  assert.equal(filled.equipmentEtc, '건조기');

  const empty = toOwnershipResponse(baseOwnership, null, NOW);
  assert.equal(empty.unitType, null);
  assert.deepEqual(empty.equipment, []);
  assert.equal(empty.equipmentEtc, null);
});

test('toPropertySummary: 값 없는 면적·층은 null', () => {
  const summary = toPropertySummary({ id: 'p1', complex, buildingNo: '101', unitNo: '1203', exclusiveArea: null, floor: null });
  assert.equal(summary.exclusiveArea, null);
  assert.equal(summary.floor, null);
});

test('toOwnershipResponse: BigInt → number, ISO 시각, null 유지', () => {
  const response = toOwnershipResponse({ ...baseOwnership, purchasePrice: 650000000n }, { id: 'p1' }, NOW);
  assert.equal(response.purchasePrice, 650000000);
  assert.equal(typeof response.purchasePrice, 'number');
  assert.equal(response.startedAt, '2026-10-01T00:00:00.000Z');
  assert.equal(response.verifiedAt, null);
  assert.equal(response.endedAt, null);
  assert.equal(response.endReason, null);
  assert.equal(response.acquiredYearMonth, null);
  assert.equal(response.isActive, true);
  assert.deepEqual(response.property, { id: 'p1' });
});

test('toOwnershipResponse: purchasePrice null 유지', () => {
  assert.equal(toOwnershipResponse(baseOwnership, null, NOW).purchasePrice, null);
});

test('toOwnershipResponse: VERIFIED + 만료 과거 → EXPIRED, 미래 → VERIFIED', () => {
  const expired = { ...baseOwnership, verificationStatus: 'VERIFIED', verifiedAt: PAST, verificationExpiresAt: PAST };
  assert.equal(toOwnershipResponse(expired, null, NOW).verificationStatus, 'EXPIRED');
  // 저장값은 바꾸지 않는다
  assert.equal(expired.verificationStatus, 'VERIFIED');

  const valid = { ...expired, verificationExpiresAt: FUTURE };
  assert.equal(toOwnershipResponse(valid, null, NOW).verificationStatus, 'VERIFIED');
});

test('toOwnershipResponse: 종료된 소유 관계는 isActive false, 없으면 null', () => {
  const ended = { ...baseOwnership, endedAt: PAST, endReason: 'SELF_ENDED' };
  const response = toOwnershipResponse(ended, null, NOW);
  assert.equal(response.isActive, false);
  assert.equal(response.endReason, 'SELF_ENDED');
  assert.equal(toOwnershipResponse(null, null, NOW), null);
});

test('resolveMyRelation: 활성 소유 → OWNER (임차 계약이 있어도 우선)', () => {
  const relation = resolveMyRelation({
    role: 'LANDLORD',
    ownerships: [{ ...baseOwnership, contracts: [{ id: 'k1' }] }],
    tenantContracts: [{ id: 'k9' }],
    now: NOW,
  });
  assert.deepEqual(relation, { type: 'OWNER', ownershipId: 'o1', verificationStatus: 'UNVERIFIED', contractIds: ['k1'] });
});

test('resolveMyRelation: OWNER의 만료 상태는 계산값', () => {
  const relation = resolveMyRelation({
    role: 'LANDLORD',
    ownerships: [{ ...baseOwnership, verificationStatus: 'VERIFIED', verificationExpiresAt: PAST }],
    now: NOW,
  });
  assert.equal(relation.verificationStatus, 'EXPIRED');
  assert.deepEqual(relation.contractIds, []);
});

test('resolveMyRelation: 임차 계약 → TENANT (종료된 소유보다 우선)', () => {
  const relation = resolveMyRelation({
    role: 'TENANT',
    ownerships: [{ ...baseOwnership, endedAt: PAST }],
    tenantContracts: [{ id: 'k1' }, { id: 'k2' }],
    now: NOW,
  });
  assert.deepEqual(relation, { type: 'TENANT', ownershipId: null, verificationStatus: null, contractIds: ['k1', 'k2'] });
});

test('resolveMyRelation: 종료된 소유만 → 가장 최근 종료된 FORMER_OWNER', () => {
  const relation = resolveMyRelation({
    role: 'LANDLORD',
    ownerships: [
      { ...baseOwnership, id: 'old', endedAt: new Date('2025-01-01T00:00:00Z') },
      { ...baseOwnership, id: 'recent', endedAt: PAST },
    ],
    now: NOW,
  });
  assert.equal(relation.type, 'FORMER_OWNER');
  assert.equal(relation.ownershipId, 'recent');
});

test('resolveMyRelation: 관계 없는 ADMIN → ADMIN', () => {
  assert.deepEqual(resolveMyRelation({ role: 'ADMIN', now: NOW }), {
    type: 'ADMIN',
    ownershipId: null,
    verificationStatus: null,
    contractIds: [],
  });
});

test('resolveMyRelation: 관계 없음 → null', () => {
  assert.equal(resolveMyRelation({ role: 'LANDLORD', ownerships: [], tenantContracts: [], now: NOW }), null);
  assert.equal(resolveMyRelation({ role: 'TENANT', now: NOW }), null);
});
