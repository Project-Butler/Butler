import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isValidAmount,
  isValidDateString,
  isValidPeriod,
  isValidTermination,
  lockedFieldsForStatus,
  normalizeTenantPhone,
  periodsOverlap,
  statusToWhere,
} from '../../src/platform/contractRules.js';
import { computeContractStatus } from '../../src/platform/contractStatus.js';

const TODAY = '2026-10-29';
const day = (value) => new Date(`${value}T00:00:00Z`);
const plusDays = (value, days) => {
  const date = day(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

test('연락처: 하이픈을 지운 010 번호만 받는다', () => {
  assert.equal(normalizeTenantPhone('010-1234-5678'), '01012345678');
  assert.equal(normalizeTenantPhone('010 123 4567'), '0101234567');
  assert.equal(normalizeTenantPhone('0212345678'), null);
  assert.equal(normalizeTenantPhone('0101234'), null);
  assert.equal(normalizeTenantPhone(null), null);
});

test('날짜 문자열: 없는 날짜는 거부', () => {
  assert.equal(isValidDateString('2026-02-28'), true);
  assert.equal(isValidDateString('2026-02-30'), false);
  assert.equal(isValidDateString('2026-2-1'), false);
  // 날짜 칸 방향키로 넘어간 끝값은 받지 않는다
  assert.equal(isValidDateString('0001-11-01'), false);
  assert.equal(isValidDateString('1999-12-31'), false);
  assert.equal(isValidDateString('2100-01-01'), false);
  assert.equal(isValidDateString('2099-12-31'), true);
});

test('금액: 유형과 맞아야 한다', () => {
  assert.equal(isValidAmount({ leaseType: 'MONTHLY', deposit: 0n, monthlyRent: 1n }), true);
  assert.equal(isValidAmount({ leaseType: 'MONTHLY', deposit: 100n, monthlyRent: 0n }), false);
  assert.equal(isValidAmount({ leaseType: 'JEONSE', deposit: 100n, monthlyRent: 1n }), false);
  assert.equal(isValidAmount({ leaseType: 'JEONSE', deposit: 0n, monthlyRent: 0n }), false);
  assert.equal(isValidAmount({ leaseType: 'JEONSE', deposit: 100n, monthlyRent: 0n }), true);
  assert.equal(isValidAmount({ leaseType: 'MONTHLY', deposit: -1n, monthlyRent: 1n }), false);
});

test('기간: 종료일이 시작일보다 뒤', () => {
  assert.equal(isValidPeriod({ startDate: '2026-11-01', endDate: '2026-11-01' }), false);
  assert.equal(isValidPeriod({ startDate: '2026-11-01', endDate: '2026-11-02' }), true);
});

test('해지일: 종료일 이하이고 오늘 이하, 아래 한계 없음', () => {
  const endDate = '2028-10-31';
  assert.equal(isValidTermination({ endDate, terminatedOn: '2026-10-30', todayKST: TODAY }), false);
  assert.equal(isValidTermination({ endDate: '2026-10-20', terminatedOn: '2026-10-25', todayKST: TODAY }), false);
  // 시작 전(11-01 시작) 계약을 오늘로 해지 = 취소
  assert.equal(isValidTermination({ endDate, terminatedOn: TODAY, todayKST: TODAY }), true);
});

test('진행 중 계약은 연락처·메모만 바꿀 수 있다', () => {
  assert.deepEqual(lockedFieldsForStatus('ACTIVE', ['deposit', 'memo', 'tenantPhone']), ['deposit']);
  assert.deepEqual(lockedFieldsForStatus('EXPIRING_SOON', ['startDate']), ['startDate']);
  assert.deepEqual(lockedFieldsForStatus('UPCOMING', ['deposit', 'startDate', 'leaseType']), []);
});

test('기간 겹침은 양끝 포함', () => {
  const a = { startDate: '2026-01-01', endDate: '2026-12-31' };
  assert.equal(periodsOverlap(a, { startDate: '2026-12-31', endDate: '2027-12-31' }), true);
  assert.equal(periodsOverlap(a, { startDate: '2027-01-01', endDate: '2027-12-31' }), false);
});

// statusToWhere 조건을 메모리에서 평가해 computeContractStatus와 같은 결과인지 교차 검증한다.
const matchesCondition = (contract, condition) =>
  Object.entries(condition).every(([field, rule]) => {
    const value = contract[field];
    if (rule === null) return value === null;
    if ('not' in rule) return value !== null;
    return Object.entries(rule).every(([op, bound]) => {
      if (value === null) return false;
      const time = value.getTime();
      if (op === 'lt') return time < bound.getTime();
      if (op === 'lte') return time <= bound.getTime();
      if (op === 'gt') return time > bound.getTime();
      return time >= bound.getTime();
    });
  });

test('상태 필터 조건이 경계일에서 computeContractStatus와 같다', () => {
  const cases = [
    { startDate: day('2026-01-01'), endDate: day(TODAY), terminatedOn: null },
    { startDate: day('2026-01-01'), endDate: day(plusDays(TODAY, 120)), terminatedOn: null },
    { startDate: day('2026-01-01'), endDate: day(plusDays(TODAY, 121)), terminatedOn: null },
    { startDate: day('2026-01-01'), endDate: day(plusDays(TODAY, -1)), terminatedOn: null },
    { startDate: day(TODAY), endDate: day(plusDays(TODAY, 30)), terminatedOn: null },
    // 시작 전인데 종료가 120일 안 → UPCOMING이어야 함
    { startDate: day(plusDays(TODAY, 1)), endDate: day(plusDays(TODAY, 60)), terminatedOn: null },
    { startDate: day('2026-01-01'), endDate: day('2027-12-31'), terminatedOn: day('2026-05-01') },
  ];
  for (const contract of cases) {
    const expected = computeContractStatus(contract, TODAY);
    for (const status of ['UPCOMING', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'TERMINATED']) {
      const where = statusToWhere([status], TODAY);
      assert.equal(
        where.OR.some((condition) => matchesCondition(contract, condition)),
        status === expected,
        `${contract.startDate.toISOString()}~${contract.endDate.toISOString()} ${status}`,
      );
    }
  }
});
