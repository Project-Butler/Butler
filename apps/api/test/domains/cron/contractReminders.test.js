// 계약 일정 알림 만들기(#159) 단위 테스트. DB를 쓰지 않는다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildContractReminders } from '../../../src/domains/cron/contractReminders.js';

const day = (value) => new Date(`${value}T00:00:00Z`);
const ID = '11111111-1111-4111-8111-111111111111';

// 2024-12-01~2026-11-30 월세 계약, 입금일 25일. 통지 구간 2026-05-30~2026-09-30.
const contract = (overrides = {}) => ({
  id: ID,
  leaseType: 'MONTHLY',
  monthlyRent: 800000n,
  rentPaymentDay: 25,
  startDate: day('2024-12-01'),
  endDate: day('2026-11-30'),
  terminatedOn: null,
  ownership: {
    userId: 'landlord',
    endedAt: null,
    property: { id: 'p', buildingNo: '101', unitNo: '1203', complex: { id: 'c', name: '잠실OO아파트', legalDongCode: '1171010100' } },
  },
  renewalNotices: [],
  ...overrides,
});

const typesOn = (todayKST, overrides) => buildContractReminders(contract(overrides), todayKST).map((item) => item.type);

test('구간 시작일: 통지 기간 시작 알림, 받는 사람은 임대인, 링크는 계약', () => {
  const [item] = buildContractReminders(contract(), '2026-05-30');
  assert.equal(item.type, 'RENEWAL_NOTICE_WINDOW_OPEN');
  assert.equal(item.userId, 'landlord');
  assert.equal(item.link, `/contracts/${ID}`);
  assert.deepEqual(item.related, { resourceType: 'CONTRACT', resourceId: ID });
  assert.equal(item.dedupeKey, `RENEWAL_NOTICE_WINDOW_OPEN:${ID}:2026-05-30`);
  assert.match(item.body, /2026-09-29까지/);
});

test('구간 전에는 통지 알림이 없고, 구간 안 OPEN 동안은 같은 키(하루 빠져도 따라잡음)', () => {
  assert.deepEqual(typesOn('2026-05-29'), []);
  const [item] = buildContractReminders(contract(), '2026-06-10');
  assert.equal(item.dedupeKey, `RENEWAL_NOTICE_WINDOW_OPEN:${ID}:2026-05-30`);
});

test('마감 30·7·1일 전 단계: 남은 일수 이상인 가장 작은 단계 하나, 마감 당일도 D1', () => {
  const deadlineItem = (today) => buildContractReminders(contract(), today).find((item) => item.type === 'RENEWAL_NOTICE_DEADLINE_SOON');
  assert.equal(deadlineItem('2026-08-30'), undefined); // 31일 전
  assert.equal(deadlineItem('2026-08-31').dedupeKey, `RENEWAL_NOTICE_DEADLINE_SOON:${ID}:2026-09-30:D30`);
  assert.equal(deadlineItem('2026-09-20').dedupeKey.endsWith(':D30'), true);
  assert.equal(deadlineItem('2026-09-23').dedupeKey.endsWith(':D7'), true);
  assert.equal(deadlineItem('2026-09-29').dedupeKey.endsWith(':D1'), true);
  assert.equal(deadlineItem('2026-09-30').title, '오늘이 갱신 거절 통지 마감일이에요');
  assert.equal(deadlineItem('2026-10-01'), undefined);
  // 마감 임박 구간에서는 구간 시작 알림을 따로 보내지 않는다
  assert.equal(typesOn('2026-09-20').includes('RENEWAL_NOTICE_WINDOW_OPEN'), false);
});

test('기한 안에 도달한 통지가 있으면 통지 알림을 보내지 않는다(늦게 도달·도달일 없음은 계속 보낸다)', () => {
  const renewalTypes = (overrides) => typesOn('2026-09-23', overrides).filter((type) => type.startsWith('RENEWAL_NOTICE_'));
  assert.deepEqual(renewalTypes({ renewalNotices: [{ deliveredOn: day('2026-07-01') }] }), []);
  assert.deepEqual(renewalTypes({ renewalNotices: [{ deliveredOn: day('2026-10-02') }] }), ['RENEWAL_NOTICE_DEADLINE_SOON']);
  assert.deepEqual(renewalTypes({ renewalNotices: [{ deliveredOn: null }] }), ['RENEWAL_NOTICE_DEADLINE_SOON']);
});

test('만료 120일 이하가 되면 만료 임박 알림(종료일이 키에 들어가 종료일을 바꾸면 다시 간다)', () => {
  const item = buildContractReminders(contract(), '2026-08-02').find((row) => row.type === 'CONTRACT_EXPIRING_SOON');
  assert.equal(item.dedupeKey, `CONTRACT_EXPIRING_SOON:${ID}:2026-11-30`);
  assert.match(item.body, /120일 남음/);
  assert.equal(typesOn('2026-08-01').includes('CONTRACT_EXPIRING_SOON'), false);
});

test('월세 입금일 당일에만, 전세·입금일 없음은 보내지 않는다', () => {
  const item = buildContractReminders(contract(), '2026-03-25').find((row) => row.type === 'RENT_PAYMENT_DUE');
  assert.equal(item.dedupeKey, `RENT_PAYMENT_DUE:${ID}:2026-03-25`);
  assert.match(item.body, /800,000원/);
  assert.deepEqual(typesOn('2026-03-24'), []);
  assert.deepEqual(typesOn('2026-03-25', { leaseType: 'JEONSE', monthlyRent: 0n, rentPaymentDay: null }), []);
  assert.deepEqual(typesOn('2026-03-25', { rentPaymentDay: null }), []);
});

test('해지·만료 계약과 끝난 소유 관계는 아무것도 보내지 않는다', () => {
  assert.deepEqual(typesOn('2026-09-25', { terminatedOn: day('2026-09-01') }), []);
  assert.deepEqual(typesOn('2026-12-25'), []);
  assert.deepEqual(typesOn('2026-09-25', { ownership: { ...contract().ownership, endedAt: new Date() } }), []);
});

test('갱신 계약이 등록된 계약은 통지 알림을 보내지 않고, 만료 임박·입금일 알림은 그대로(#242)', () => {
  const typesRenewed = (today) => buildContractReminders(contract(), today, { renewed: true }).map((item) => item.type);
  assert.deepEqual(typesRenewed('2026-05-30'), []);
  assert.deepEqual(typesRenewed('2026-09-23'), ['CONTRACT_EXPIRING_SOON']);
  assert.deepEqual(typesRenewed('2026-09-25'), ['CONTRACT_EXPIRING_SOON', 'RENT_PAYMENT_DUE']);
  // 갱신 계약이 없으면(새 임차인 계약 포함) 그대로 보낸다
  assert.equal(typesOn('2026-09-23').includes('RENEWAL_NOTICE_DEADLINE_SOON'), true);
});
