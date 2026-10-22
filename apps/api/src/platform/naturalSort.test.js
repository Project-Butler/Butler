import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareNatural, compareUnits } from './naturalSort.js';

const unit = (buildingNo, unitNo, complex = { id: 'c1', name: '중계그린' }) => ({ complex, buildingNo, unitNo });
const label = (row) => `${row.buildingNo}/${row.unitNo}`;

test('자연 정렬: 숫자는 값으로("2동" < "10동", "201" < "1001")', () => {
  assert.ok(compareNatural('2', '10') < 0);
  assert.ok(compareNatural('201', '1001') < 0);
  assert.ok(compareNatural('B1', 'B10') < 0);
});

test('호실: 동 → 호 순서, 빈 동(동 없는 건물)이 먼저', () => {
  const rows = [unit('10', '101'), unit('2', '1001'), unit('2', '201'), unit('', '410'), unit('가', '101')];
  assert.deepEqual(rows.sort(compareUnits).map(label), ['/410', '2/201', '2/1001', '10/101', '가/101']);
});

test('호실: 다른 단지는 단지 이름으로 묶는다', () => {
  const other = { id: 'c2', name: '노원파크' };
  const rows = [unit('1', '101'), unit('1', '101', other), unit('2', '101', other)];
  assert.deepEqual(
    rows.sort(compareUnits).map((row) => `${row.complex.name} ${label(row)}`),
    ['노원파크 1/101', '노원파크 2/101', '중계그린 1/101'],
  );
});
