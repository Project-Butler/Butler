import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computePropertyStatus } from './propertyStatus.js';

const TODAY = '2026-10-20';
const day = (value) => new Date(`${value}T00:00:00Z`);
const contract = (startDate, endDate, terminatedOn = null) => ({
  startDate: day(startDate),
  endDate: day(endDate),
  terminatedOn: terminatedOn ? day(terminatedOn) : null,
});

test('계약이 없으면 공실', () => {
  assert.equal(computePropertyStatus([], TODAY), 'VACANT');
  assert.equal(computePropertyStatus(undefined, TODAY), 'VACANT');
});

test('진행 중(만료 임박 포함) 계약이 있으면 임대중', () => {
  assert.equal(computePropertyStatus([contract('2026-01-01', '2027-12-31')], TODAY), 'LEASED');
  assert.equal(computePropertyStatus([contract('2025-01-01', '2026-11-30')], TODAY), 'LEASED');
});

test('진행 중은 없고 시작 전 계약만 있으면 계약대기', () => {
  assert.equal(computePropertyStatus([contract('2026-11-01', '2028-10-31')], TODAY), 'CONTRACT_PENDING');
  // 진행 중 + 다음 계약(시작 전)이면 임대중이 먼저
  assert.equal(
    computePropertyStatus([contract('2026-11-01', '2028-10-31'), contract('2024-11-01', '2026-10-31')], TODAY),
    'LEASED',
  );
});

test('해지·만료 계약만 있으면 공실', () => {
  assert.equal(computePropertyStatus([contract('2026-01-01', '2027-12-31', '2026-06-30')], TODAY), 'VACANT');
  assert.equal(computePropertyStatus([contract('2024-01-01', '2025-12-31')], TODAY), 'VACANT');
});
