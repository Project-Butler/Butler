import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDisplayName, isCombinedUnitAddress, normalizeBuildingNo, normalizeUnitNo } from './unitAddress.js';

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

// 규칙을 넓혀도 이미 저장된 키가 바뀌면 안 된다(Property @@unique 키). 기존 입력의 결과를 고정한다.
test('하위 호환: 기존 입력의 정규화 결과가 그대로다', () => {
  const buildingCases = [
    ['101', '101'],
    ['101동', '101'],
    [' 101 ', '101'],
    ['１０１', '101'],
    ['가동', '가동'],
    ['a1', 'A1'],
    ['b동', 'B'],
    ['동', ''],
    ['동동', '동동'],
    ['   ', ''],
  ];
  for (const [input, expected] of buildingCases) assert.equal(normalizeBuildingNo(input), expected, input);

  const unitCases = [
    ['1203', '1203'],
    ['1203호', '1203'],
    ['12 03 호', '1203'],
    ['１２０３호', '1203'],
    [' 호 ', ''],
    ['B101', 'B101'],
  ];
  for (const [input, expected] of unitCases) {
    assert.equal(normalizeUnitNo(input), expected, input);
    assert.equal(normalizeUnitNo(input, '101'), expected, input);
  }
});

test("대장 표기 '제103동'·'주건축물제103동'을 떼어 낸다", () => {
  assert.equal(normalizeBuildingNo('제103동'), '103');
  assert.equal(normalizeBuildingNo('주건축물제103동'), '103');
  assert.equal(normalizeBuildingNo('제 103 동'), '103');
  assert.equal(normalizeBuildingNo('제A동'), 'A');
});

test("한글 동 이름의 앞 '제'는 그대로 둔다", () => {
  assert.equal(normalizeBuildingNo('제일동'), '제일동');
  assert.equal(normalizeBuildingNo('주건축물'), '주건축물');
});

test("호의 앞 층 표기('3층310호')를 뗀다", () => {
  assert.equal(normalizeUnitNo('3층310호'), '310');
  assert.equal(normalizeUnitNo('12층 1203호'), '1203');
  assert.equal(normalizeUnitNo('3층'), '3층');
});

test("호 칸 앞의 같은 동 표기('101동 303호')를 뗀다", () => {
  assert.equal(normalizeUnitNo('101동 303호', '101동'), '303');
  assert.equal(normalizeUnitNo('101동303', '101'), '303');
  // 동을 모르거나 다른 동이면 떼지 않는다(한 칸 입력으로 거부됨)
  assert.equal(normalizeUnitNo('101동 303호'), '101동303');
  assert.equal(normalizeUnitNo('102동 303호', '101'), '102동303');
});

test('동·호를 한 칸에 적은 값을 알아본다', () => {
  assert.equal(isCombinedUnitAddress(normalizeBuildingNo('101-1203')), true);
  assert.equal(isCombinedUnitAddress(normalizeBuildingNo('101동1203호')), true);
  assert.equal(isCombinedUnitAddress(normalizeBuildingNo('101동 1203호')), true);
  assert.equal(isCombinedUnitAddress(normalizeUnitNo('101-1203')), true);
  assert.equal(isCombinedUnitAddress(normalizeUnitNo('102동 303호', '101')), true);

  for (const value of ['101', '가동', 'A1', '101-1', '1203', '303']) {
    assert.equal(isCombinedUnitAddress(value), false, value);
  }
});
