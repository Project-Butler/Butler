import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDisplayName, normalizeBuildingNo, normalizeUnitNo } from './unitAddress.js';

test('끝의 동/호 한 글자를 뗀다', () => {
  assert.equal(normalizeBuildingNo('101동'), '101');
  assert.equal(normalizeUnitNo('1203호'), '1203');
});

test('공백을 모두 지운다', () => {
  assert.equal(normalizeBuildingNo(' 101 '), '101');
  assert.equal(normalizeUnitNo('12 03 호'), '1203');
});

test('전각 숫자를 반각으로 바꾼다', () => {
  assert.equal(normalizeBuildingNo('１０１'), '101');
  assert.equal(normalizeUnitNo('１２０３호'), '1203');
});

test("'가동'처럼 한글 뒤의 동은 그대로 둔다", () => {
  assert.equal(normalizeBuildingNo('가동'), '가동');
});

test('라틴 문자는 대문자로 바꾸고 그 뒤의 동은 뗀다', () => {
  assert.equal(normalizeBuildingNo('a1'), 'A1');
  assert.equal(normalizeBuildingNo('b동'), 'B');
});

test('문자열이 아니면 빈 문자열', () => {
  assert.equal(normalizeBuildingNo(101), '');
  assert.equal(normalizeUnitNo(undefined), '');
});

test('displayName', () => {
  assert.equal(formatDisplayName('잠실OO아파트', '101', '1203'), '잠실OO아파트 101동 1203호');
  assert.equal(formatDisplayName('잠실OO아파트', '가동', '101'), '잠실OO아파트 가동 101호');
});

test("동/호만 입력하거나 공백뿐이면 빈 문자열", () => {
  assert.equal(normalizeBuildingNo('동'), '');
  assert.equal(normalizeUnitNo(' 호 '), '');
  assert.equal(normalizeBuildingNo('   '), '');
  assert.equal(normalizeBuildingNo('동동'), '동동');
});
