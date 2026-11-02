import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPnu, parsePnu, rollUpLegalDongCode } from './pnu.js';

test("산 지번(mtYn '1') → 11번째 자리 '2'", () => {
  const pnu = buildPnu('1171010200', '1', '7', '0');
  assert.equal(pnu.length, 19);
  assert.equal(pnu[10], '2');
});

test("일반 지번(mtYn '0') → 11번째 자리 '1', 본번·부번 4자리 0 채움", () => {
  const pnu = buildPnu('1171010200', '0', '17', '3');
  assert.equal(pnu, '1171010200100170003');
  assert.equal(pnu[10], '1');
});

test('리 단위 admCd는 PNU에 그대로, rollUpLegalDongCode는 00으로 끝남', () => {
  const riCode = '4182025021';
  const pnu = buildPnu(riCode, '0', '123', '0');
  assert.equal(pnu.slice(0, 10), riCode);
  assert.equal(rollUpLegalDongCode(riCode), '4182025000');
  assert.ok(rollUpLegalDongCode(riCode).endsWith('00'));
});

test('parsePnu는 buildPnu를 되돌린다', () => {
  assert.deepEqual(parsePnu(`PNU:${buildPnu('1171010200', '1', '7', '2')}`), {
    admCd: '1171010200',
    mtYn: '1',
    mainNo: '0007',
    subNo: '0002',
  });
  assert.equal(parsePnu('123'), null);
});
