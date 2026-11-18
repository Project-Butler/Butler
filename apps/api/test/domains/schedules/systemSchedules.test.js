// 계약 → SYSTEM 일정 계산(#161) 단위 테스트. DB를 쓰지 않는다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildContractSchedules, compareSchedules, toSystemScheduleId } from '../../../src/domains/schedules/systemSchedules.js';
import { listRentPaymentDates } from '../../../src/platform/rentPayment.js';
import { isUuid } from '../../../src/platform/uuid.js';

const day = (value) => new Date(`${value}T00:00:00Z`);
const ID = '11111111-1111-4111-8111-111111111111';

// 2024-12-01~2026-11-30 월세 계약, 입금일 25일, 갱신 거절 통지 마감 2026-09-30
const contract = (overrides = {}) => ({
  id: ID,
  leaseType: 'MONTHLY',
  monthlyRent: 500000n,
  rentPaymentDay: 25,
  startDate: day('2024-12-01'),
  endDate: day('2026-11-30'),
  terminatedOn: null,
  ownership: { property: { id: 'p', buildingNo: '101', unitNo: '1203', complex: { id: 'c', name: '잠실OO아파트', legalDongCode: '1171010100' } } },
  ...overrides,
});

const kindsDates = (items) => items.map((item) => `${item.kind}:${item.date}`);

test('입금일 목록: 기간 안 매달, 계약 시작 전·종료 후는 빼고, 없는 날은 말일', () => {
  assert.deepEqual(listRentPaymentDates(contract(), { fromDate: '2026-09-01', toDate: '2026-12-31' }), ['2026-09-25', '2026-10-25', '2026-11-25']);
  assert.deepEqual(listRentPaymentDates(contract(), { fromDate: '2024-11-01', toDate: '2025-01-31' }), ['2024-12-25', '2025-01-25']);
  assert.deepEqual(listRentPaymentDates(contract({ rentPaymentDay: 31 }), { fromDate: '2026-02-01', toDate: '2026-04-30' }), [
    '2026-02-28',
    '2026-03-31',
    '2026-04-30',
  ]);
  // 해지일 뒤는 없다
  assert.deepEqual(listRentPaymentDates(contract({ terminatedOn: day('2026-10-10') }), { fromDate: '2026-10-01', toDate: '2026-11-30' }), []);
  assert.deepEqual(listRentPaymentDates(contract({ leaseType: 'JEONSE', rentPaymentDay: null }), { fromDate: '2026-10-01', toDate: '2026-10-31' }), []);
});

test('임대인: 입금일·통지 마감·계약 만기, 금액은 입금일에만', () => {
  const items = buildContractSchedules(contract(), { viewer: 'LANDLORD', fromDate: '2026-09-01', toDate: '2026-11-30' });
  assert.deepEqual(kindsDates(items.sort(compareSchedules)), [
    'RENT_PAYMENT:2026-09-25',
    'RENEWAL_NOTICE_DEADLINE:2026-09-30',
    'RENT_PAYMENT:2026-10-25',
    'RENT_PAYMENT:2026-11-25',
    'CONTRACT_END:2026-11-30',
  ]);
  const rent = items.find((item) => item.kind === 'RENT_PAYMENT');
  assert.equal(rent.amount, 500000);
  assert.equal(rent.source, 'SYSTEM');
  assert.equal(rent.title, '월세 입금일');
  assert.equal(rent.property.displayName.includes('1203'), true);
  assert.deepEqual(rent.related, { resourceType: 'CONTRACT', resourceId: ID });
  assert.equal(items.find((item) => item.kind === 'CONTRACT_END').amount, null);
});

test('임차인: 계약 만기만', () => {
  const items = buildContractSchedules(contract(), { viewer: 'TENANT', fromDate: '2026-09-01', toDate: '2026-11-30' });
  assert.deepEqual(kindsDates(items), ['CONTRACT_END:2026-11-30']);
});

test('id는 같은 일정이면 늘 같고 UUID 모양이다', () => {
  const a = buildContractSchedules(contract(), { viewer: 'LANDLORD', fromDate: '2026-11-01', toDate: '2026-11-30' });
  const b = buildContractSchedules(contract(), { viewer: 'LANDLORD', fromDate: '2026-10-15', toDate: '2026-11-30' });
  const endA = a.find((item) => item.kind === 'CONTRACT_END');
  const endB = b.find((item) => item.kind === 'CONTRACT_END');
  assert.equal(endA.id, endB.id);
  assert.equal(isUuid(endA.id), true);
  assert.notEqual(toSystemScheduleId('a'), toSystemScheduleId('b'));
});
