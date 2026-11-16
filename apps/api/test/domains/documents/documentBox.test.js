// 서류함 계약 정렬 단위 테스트. DB를 쓰지 않는다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sortDocumentBoxContracts } from '../../../src/domains/documents/documentBox.js';

const contract = (id, status, startDate, endDate, terminatedOn = null) => ({ id, status, startDate, endDate, terminatedOn });
const ids = (list) => list.map((item) => item.id);

test('시작 전·진행 중·만료 임박이 먼저, 시작일 최근 순', () => {
  const sorted = sortDocumentBoxContracts([
    contract('a', 'ACTIVE', '2025-01-01', '2027-01-01'),
    contract('b', 'UPCOMING', '2027-03-01', '2028-03-01'),
    contract('c', 'EXPIRING_SOON', '2025-06-01', '2026-12-31'),
    contract('d', 'EXPIRED', '2023-01-01', '2024-12-31'),
  ]);
  assert.deepEqual(ids(sorted), ['b', 'c', 'a', 'd']);
});

test('지난 계약은 종료일 최근 순이고, 해지는 해지일로 비교한다', () => {
  const sorted = sortDocumentBoxContracts([
    contract('expired-old', 'EXPIRED', '2020-01-01', '2022-01-01'),
    contract('terminated-new', 'TERMINATED', '2023-01-01', '2030-01-01', '2024-06-30'),
    contract('expired-new', 'EXPIRED', '2023-01-01', '2024-01-31'),
    contract('active', 'ACTIVE', '2025-01-01', '2027-01-01'),
  ]);
  assert.deepEqual(ids(sorted), ['active', 'terminated-new', 'expired-new', 'expired-old']);
});

test('입력 배열을 바꾸지 않고, 같은 날짜는 id 순으로 안정 정렬한다', () => {
  const input = [contract('b', 'ACTIVE', '2025-01-01', '2027-01-01'), contract('a', 'ACTIVE', '2025-01-01', '2027-01-01')];
  assert.deepEqual(ids(sortDocumentBoxContracts(input)), ['a', 'b']);
  assert.deepEqual(ids(input), ['b', 'a']);
});
