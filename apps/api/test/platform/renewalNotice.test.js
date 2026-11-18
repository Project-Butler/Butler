import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeRenewalNoticePhase,
  computeRenewalNoticeTiming,
  computeRenewalNoticeWindow,
  toRenewalNoticeSummary,
} from '../../src/platform/renewalNotice.js';

const day = (value) => new Date(`${value}T00:00:00Z`);

// 2024-12-01~2026-11-30 계약
const contract = (overrides = {}) => ({
  startDate: day('2024-12-01'),
  endDate: day('2026-11-30'),
  terminatedOn: null,
  ...overrides,
});

const notice = (overrides = {}) => ({
  id: 'n1',
  kind: 'REFUSE_RENEWAL',
  method: 'CERTIFIED_MAIL',
  sentOn: day('2026-08-01'),
  deliveredOn: day('2026-08-03'),
  ...overrides,
});

test('통지 구간은 만료 6개월 전 같은 날부터 2개월 전 같은 날까지, 권장 마감은 하루 이르다', () => {
  assert.deepEqual(computeRenewalNoticeWindow(day('2026-11-30')), {
    windowStart: '2026-05-30',
    deadline: '2026-09-30',
    safeDeadline: '2026-09-29',
  });
});

test('그달에 없는 날은 말일로 맞추고 해를 넘긴다', () => {
  // 8-31의 2개월 전 → 6-30, 6개월 전 → 2-28
  assert.deepEqual(computeRenewalNoticeWindow('2026-08-31'), {
    windowStart: '2026-02-28',
    deadline: '2026-06-30',
    safeDeadline: '2026-06-29',
  });
  // 윤년 2월 29일
  assert.equal(computeRenewalNoticeWindow('2028-08-31').windowStart, '2028-02-29');
  // 3월 만료 → 전년 9월부터
  assert.deepEqual(computeRenewalNoticeWindow('2027-03-15'), {
    windowStart: '2026-09-15',
    deadline: '2027-01-15',
    safeDeadline: '2027-01-14',
  });
});

test('단계: 구간 전 → OPEN → 마감 30일 이하 CLOSING_SOON → 마감 다음 날 CLOSED', () => {
  const window = computeRenewalNoticeWindow('2026-11-30');
  assert.equal(computeRenewalNoticePhase(window, '2026-05-29'), 'BEFORE_WINDOW');
  assert.equal(computeRenewalNoticePhase(window, '2026-05-30'), 'OPEN');
  assert.equal(computeRenewalNoticePhase(window, '2026-08-30'), 'OPEN');
  assert.equal(computeRenewalNoticePhase(window, '2026-08-31'), 'CLOSING_SOON');
  assert.equal(computeRenewalNoticePhase(window, '2026-09-30'), 'CLOSING_SOON');
  assert.equal(computeRenewalNoticePhase(window, '2026-10-01'), 'CLOSED');
});

test('도달 시점: 양 끝 포함 구간 안이면 IN_TIME, 도달일이 없으면 UNCONFIRMED', () => {
  const window = computeRenewalNoticeWindow('2026-11-30');
  assert.equal(computeRenewalNoticeTiming(notice({ deliveredOn: day('2026-05-30') }), window), 'IN_TIME');
  assert.equal(computeRenewalNoticeTiming(notice({ deliveredOn: day('2026-09-30') }), window), 'IN_TIME');
  assert.equal(computeRenewalNoticeTiming(notice({ deliveredOn: day('2026-05-29') }), window), 'TOO_EARLY');
  assert.equal(computeRenewalNoticeTiming(notice({ deliveredOn: day('2026-10-01') }), window), 'LATE');
  assert.equal(computeRenewalNoticeTiming(notice({ deliveredOn: null }), window), 'UNCONFIRMED');
});

test('계약 요약: 마감 D-day·최근 통지·기한 안 도달 여부', () => {
  const summary = toRenewalNoticeSummary(contract(), {
    todayKST: '2026-09-20',
    notices: [notice({ id: 'n2', deliveredOn: null }), notice()],
  });
  assert.equal(summary.phase, 'CLOSING_SOON');
  assert.equal(summary.daysUntilDeadline, 10);
  assert.equal(summary.hasDeliveredInTime, true);
  assert.equal(summary.latestNotice.id, 'n2');
  assert.equal(summary.latestNotice.timing, 'UNCONFIRMED');

  const empty = toRenewalNoticeSummary(contract(), { todayKST: '2026-10-05' });
  assert.equal(empty.phase, 'CLOSED');
  assert.equal(empty.daysUntilDeadline, -5);
  assert.equal(empty.hasDeliveredInTime, false);
  assert.equal(empty.latestNotice, null);
});

test('계약 요약: 해지·만료 계약과 끝난 소유 관계는 null, 시작 전 계약은 값이 있다', () => {
  assert.equal(toRenewalNoticeSummary(contract({ terminatedOn: day('2026-01-01') }), { todayKST: '2026-02-01' }), null);
  assert.equal(toRenewalNoticeSummary(contract(), { todayKST: '2026-12-01' }), null);
  assert.equal(toRenewalNoticeSummary(contract(), { todayKST: '2026-06-01', ownershipEnded: true }), null);
  assert.equal(toRenewalNoticeSummary(contract(), { todayKST: '2024-11-01' }).phase, 'BEFORE_WINDOW');
});
