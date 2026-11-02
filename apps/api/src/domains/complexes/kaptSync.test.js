import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertDeactivationWithinLimit,
  assertFetchedEnough,
  isKaptComplexChanged,
  KaptSyncAbortError,
  MAX_DEACTIVATIONS,
  MIN_EXPECTED_ROWS,
  toKaptComplexRow,
  toKaptComplexRows,
} from './kaptSync.js';

const PARKRIO = {
  kaptCode: 'A13824006',
  kaptName: ' 잠실파크리오 ',
  bjdCode: '1171010200',
  as1: '서울특별시',
  as2: '송파구',
  as3: '신천동',
  as4: null,
};

test('K-apt 목록 행 → kapt_complexes 행 (이름 trim, 리 없으면 null)', () => {
  assert.deepEqual(toKaptComplexRow(PARKRIO), {
    kaptCode: 'A13824006',
    name: '잠실파크리오',
    legalDongCode: '1171010200',
    sidoName: '서울특별시',
    sigunguName: '송파구',
    dongName: '신천동',
    riName: null,
  });
});

test('리 단위 bjdCode와 리 이름은 그대로 둔다', () => {
  const row = toKaptComplexRow({ ...PARKRIO, bjdCode: 4182025021, as3: '가평읍', as4: '읍내리' });
  assert.equal(row.legalDongCode, '4182025021');
  assert.equal(row.riName, '읍내리');
});

test('코드·이름이 없거나 bjdCode가 10자리 숫자가 아니면 건너뛴다', () => {
  assert.equal(toKaptComplexRow({ ...PARKRIO, kaptCode: '' }), null);
  assert.equal(toKaptComplexRow({ ...PARKRIO, kaptName: '  ' }), null);
  assert.equal(toKaptComplexRow({ ...PARKRIO, bjdCode: '11710102' }), null);
  assert.equal(toKaptComplexRow({ ...PARKRIO, bjdCode: null }), null);
  assert.equal(toKaptComplexRow({ ...PARKRIO, kaptCode: 'A'.repeat(21) }), null);
  assert.equal(toKaptComplexRow(null), null);
});

test('같은 kaptCode는 한 행으로 합치고 잘못된 행 수를 센다', () => {
  const { rows, skipped } = toKaptComplexRows([PARKRIO, { ...PARKRIO, kaptName: '파크리오' }, { kaptCode: 'X' }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, '파크리오');
  assert.equal(skipped, 1);
});

test('전국 목록이 최소 건수보다 적으면 멈춘다', () => {
  assert.throws(
    () => assertFetchedEnough({ fetchedCount: MIN_EXPECTED_ROWS - 1, activeCount: 0 }),
    KaptSyncAbortError,
  );
  assert.doesNotThrow(() => assertFetchedEnough({ fetchedCount: MIN_EXPECTED_ROWS, activeCount: 0 }));
});

test('지금 활성 단지의 80%에 못 미치면 멈춘다', () => {
  assert.throws(() => assertFetchedEnough({ fetchedCount: 17000, activeCount: 22000 }), KaptSyncAbortError);
  assert.doesNotThrow(() => assertFetchedEnough({ fetchedCount: 17600, activeCount: 22000 }));
});

test('이름·코드가 바뀌었거나 비활성이면 변경으로 본다', () => {
  const row = toKaptComplexRow(PARKRIO);
  assert.equal(isKaptComplexChanged({ ...row, isActive: true }, row), false);
  assert.equal(isKaptComplexChanged({ ...row, isActive: false }, row), true);
  assert.equal(isKaptComplexChanged({ ...row, isActive: true, name: '파크리오' }, row), true);
  assert.equal(isKaptComplexChanged({ ...row, isActive: true, riName: '읍내리' }, row), true);
});

test('한 번에 비활성으로 바꿀 단지가 상한을 넘으면 멈춘다', () => {
  assert.doesNotThrow(() => assertDeactivationWithinLimit(MAX_DEACTIVATIONS));
  assert.throws(() => assertDeactivationWithinLimit(MAX_DEACTIVATIONS + 1), KaptSyncAbortError);
});
