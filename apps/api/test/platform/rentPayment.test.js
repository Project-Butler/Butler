import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDateKST } from '../../src/platform/dateUtils.js';
import { computeNextRentPaymentDate } from '../../src/platform/rentPayment.js';

const day = (value) => new Date(`${value}T00:00:00Z`);

// 2026-01-01~2027-12-31 월세 계약(진행 중)
const contract = (overrides = {}) => ({
  leaseType: 'MONTHLY',
  rentPaymentDay: 25,
  startDate: day('2026-01-01'),
  endDate: day('2027-12-31'),
  terminatedOn: null,
  ...overrides,
});
const next = (todayKST, overrides = {}, options = {}) =>
  computeNextRentPaymentDate(contract(overrides), { todayKST, ...options });

test('이번 달 입금일이 남았으면 이번 달, 지났으면 다음 달', () => {
  assert.equal(next('2026-11-04'), '2026-11-25');
  assert.equal(next('2026-11-26'), '2026-12-25');
  // 해를 넘긴다
  assert.equal(next('2026-12-26'), '2027-01-25');
});

test('오늘이 입금일이면 오늘', () => {
  assert.equal(next('2026-11-25'), '2026-11-25');
});

test('없는 날은 그달 말일: 31 → 2월 28일·윤년 29일, 4월 30일', () => {
  assert.equal(next('2026-02-01', { rentPaymentDay: 31 }), '2026-02-28');
  assert.equal(next('2027-02-10', { rentPaymentDay: 31 }), '2027-02-28');
  assert.equal(next('2028-02-10', { rentPaymentDay: 31, endDate: day('2029-12-31') }), '2028-02-29');
  assert.equal(next('2026-04-01', { rentPaymentDay: 31 }), '2026-04-30');
  assert.equal(next('2026-02-01', { rentPaymentDay: 30 }), '2026-02-28');
  // 말일이 지났으면 다음 달 말일
  assert.equal(next('2026-03-01', { rentPaymentDay: 31 }), '2026-03-31');
  assert.equal(next('2026-01-31', { rentPaymentDay: 31 }), '2026-01-31');
});

test('시작 전 계약은 시작일 이후 첫 입금일', () => {
  const upcoming = { startDate: day('2027-03-10'), endDate: day('2029-03-09') };
  assert.equal(next('2026-11-04', upcoming), '2027-03-25');
  assert.equal(next('2026-11-04', { ...upcoming, rentPaymentDay: 10 }), '2027-03-10');
  assert.equal(next('2026-11-04', { ...upcoming, rentPaymentDay: 5 }), '2027-04-05');
});

test('종료일·해지일을 넘으면 null', () => {
  assert.equal(next('2027-12-26'), null);
  assert.equal(next('2027-12-20'), '2027-12-25');
  assert.equal(next('2027-12-20', { endDate: day('2027-12-24') }), null);
  // 종료일 당일이 입금일이면 포함
  assert.equal(next('2027-12-20', { endDate: day('2027-12-25') }), '2027-12-25');
});

test('전세·값 없음·해지·만료·끝난 소유 관계는 null', () => {
  assert.equal(next('2026-11-04', { leaseType: 'JEONSE', rentPaymentDay: null }), null);
  assert.equal(next('2026-11-04', { leaseType: 'JEONSE' }), null);
  assert.equal(next('2026-11-04', { rentPaymentDay: null }), null);
  assert.equal(next('2026-11-04', { terminatedOn: day('2026-11-01') }), null);
  assert.equal(next('2028-01-05'), null);
  assert.equal(next('2026-11-04', {}, { ownershipEnded: true }), null);
});

test('KST 자정 경계: UTC 15시가 KST 다음 날 0시', () => {
  // 2026-11-25 14:59:59Z = KST 11-25 23:59:59 → 오늘이 입금일
  assert.equal(next(formatDateKST(new Date('2026-11-25T14:59:59Z'))), '2026-11-25');
  // 2026-11-25 15:00:00Z = KST 11-26 00:00 → 다음 달
  assert.equal(next(formatDateKST(new Date('2026-11-25T15:00:00Z'))), '2026-12-25');
  // UTC로는 아직 11-24지만 KST는 11-25
  assert.equal(next(formatDateKST(new Date('2026-11-24T15:00:00Z'))), '2026-11-25');
});
