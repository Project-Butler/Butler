// 소통 스레드 규칙(읽기 전용·제목) 단위 테스트. DB를 쓰지 않는다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contractEndOn, formatThreadTitle, isThreadContextReadOnly } from '../../src/platform/threadRules.js';

const TODAY = '2026-11-12';
const NOW = new Date('2026-11-12T03:00:00Z');
const at = { now: NOW, todayKST: TODAY };
const DAY = 24 * 60 * 60 * 1000;

test('계약: 끝난 날부터 30일까지는 쓸 수 있고, 31일째부터 읽기 전용', () => {
  assert.equal(isThreadContextReadOnly({ contractEndOn: '2027-10-01' }, at), false);
  assert.equal(isThreadContextReadOnly({ contractEndOn: '2026-10-13' }, at), false);
  assert.equal(isThreadContextReadOnly({ contractEndOn: '2026-10-12' }, at), true);
});

test('티켓: 끝나지 않았으면 쓸 수 있고, 끝난 지 30일이 지나면 읽기 전용', () => {
  assert.equal(isThreadContextReadOnly({ closedAt: null }, at), false);
  assert.equal(isThreadContextReadOnly({ closedAt: new Date(NOW.getTime() - 29 * DAY) }, at), false);
  assert.equal(isThreadContextReadOnly({ closedAt: new Date(NOW.getTime() - 31 * DAY) }, at), true);
});

test('임대인 소유 관계가 끝나면 바로 읽기 전용', () => {
  assert.equal(isThreadContextReadOnly({ ownershipEndedAt: new Date(), contractEndOn: '2027-10-01' }, at), true);
  assert.equal(isThreadContextReadOnly({ ownershipEndedAt: new Date(), closedAt: null }, at), true);
});

test('계약 끝나는 날은 해지일이 우선', () => {
  const endDate = new Date('2027-10-01T00:00:00Z');
  assert.equal(contractEndOn({ endDate, terminatedOn: null }), '2027-10-01');
  assert.equal(contractEndOn({ endDate, terminatedOn: new Date('2026-12-31T00:00:00Z') }), '2026-12-31');
});

test('제목: 계약은 "동 호 계약", 티켓은 "동 호 · 티켓 제목"', () => {
  const property = { buildingNo: '101', unitNo: '1203' };
  assert.equal(formatThreadTitle('CONTRACT', { property }), '101동 1203호 계약');
  assert.equal(formatThreadTitle('TICKET', { property, ticketTitle: '보일러 누수' }), '101동 1203호 · 보일러 누수');
  assert.equal(formatThreadTitle('CONTRACT', { property: { buildingNo: '', unitNo: '410' } }), '410호 계약');
});
