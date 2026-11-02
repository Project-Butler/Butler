import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildKaptLookup,
  matchBuilding,
  parseBuildingLine,
  toBuildingLotKeyIds,
  toBuildingRoadKey,
  toRoadAddressText,
} from './jusoBuildingMatcher.js';

// 전체분·변동분 공통 31칸 줄(2026-09 전체분 중계그린 한 동을 바탕으로 칸만 바꿔 쓴다)
const makeLine = (overrides = {}) => {
  const fields = {
    1: '1135010600',
    2: '서울특별시',
    3: '노원구',
    4: '중계동',
    5: '',
    6: '0',
    7: '503',
    8: '0',
    9: '113504154190',
    10: '섬밭로',
    11: '0',
    12: '285',
    13: '0',
    14: '중계그린아파트',
    15: '101동',
    16: '1135010600105030000000001',
    17: '01',
    18: '1135062500',
    19: '중계2.3동',
    20: '01773',
    21: '',
    22: '',
    23: '34',
    24: '20110729',
    25: '',
    26: '',
    27: '1',
    28: '01773',
    29: '0',
    30: '',
    31: '',
    ...overrides,
  };
  return Array.from({ length: 31 }, (_, index) => fields[index + 1]).join('|');
};

const LOOKUP = buildKaptLookup({
  roadLinks: [
    { roadSigunguCd: '11350', roadNameKey: '섬밭로', roadUnderground: false, roadMainNo: 285, roadSubNo: 0, kaptCode: 'A13986306', saleType: '분양' },
    // 한 주소를 분양·임대 단지가 같이 씀(학여울청구)
    { roadSigunguCd: '11350', roadNameKey: '동일로207길', roadUnderground: false, roadMainNo: 186, roadSubNo: 0, kaptCode: 'A13993901', saleType: '임대' },
    { roadSigunguCd: '11350', roadNameKey: '동일로207길', roadUnderground: false, roadMainNo: 186, roadSubNo: 0, kaptCode: 'A13987305', saleType: '분양' },
  ],
  lots: [{ legalDongCode: '1135010600', mainLot: 504, subLot: 1, kaptCode: 'A13986306', saleType: '분양' }],
});

test('줄 파싱: 31칸, 건물관리번호·법정동 코드·건물번호', () => {
  const row = parseBuildingLine(makeLine());
  assert.equal(row.buildingMgtNo, '1135010600105030000000001');
  assert.equal(row.legalDongCode, '1135010600');
  assert.equal(row.roadName, '섬밭로');
  assert.equal(row.underground, false);
  assert.equal(row.mainNo, 285);
  assert.equal(row.subNo, 0);
  assert.equal(row.changeReasonCode, '34');
  assert.equal(row.isApartment, true);
});

test('줄 파싱: 칸 수가 다르거나 키 칸이 틀리면 null', () => {
  assert.equal(parseBuildingLine(`${makeLine()}|추가`), null);
  assert.equal(parseBuildingLine(makeLine().split('|').slice(0, 30).join('|')), null);
  assert.equal(parseBuildingLine(makeLine({ 16: '1135010600' })), null);
  assert.equal(parseBuildingLine(makeLine({ 1: '11350' })), null);
  assert.equal(parseBuildingLine(makeLine({ 12: '' })), null);
  assert.equal(parseBuildingLine(''), null);
});

test('도로명 키: 시군구 = 법정동 앞 5자리, 도로명 공백 제거, 지하', () => {
  assert.deepEqual(toBuildingRoadKey(parseBuildingLine(makeLine({ 10: '동일로 207길', 11: '1', 13: '2' }))), {
    sigunguCd: '11350',
    roadNameKey: '동일로207길',
    underground: true,
    mainNo: 285,
    subNo: 2,
  });
});

test('도로명 키: 지하여부 2(공중)·3(수상)이나 도로명이 없으면 null', () => {
  assert.equal(toBuildingRoadKey(parseBuildingLine(makeLine({ 11: '3' }))), null);
  assert.equal(toBuildingRoadKey(parseBuildingLine(makeLine({ 10: '' }))), null);
});

test('필지 키: 건물관리번호 앞 19자리(PNU)와 대표 지번, 산은 뺀다', () => {
  const row = parseBuildingLine(makeLine({ 16: '1135010600105040001000001', 7: '503' }));
  assert.deepEqual(toBuildingLotKeyIds(row).sort(), ['1135010600|503|0', '1135010600|504|1']);
  const mountain = parseBuildingLine(makeLine({ 16: '1135010600205040001000001', 6: '1' }));
  assert.deepEqual(toBuildingLotKeyIds(mountain), []);
});

test('맞추기: 공동주택 + 도로명 키 → ROAD_KEY', () => {
  const link = matchBuilding(parseBuildingLine(makeLine()), LOOKUP);
  assert.deepEqual(link, {
    buildingMgtNo: '1135010600105030000000001',
    roadSigunguCd: '11350',
    roadNameKey: '섬밭로',
    roadUnderground: false,
    roadMainNo: 285,
    roadSubNo: 0,
    roadCode: '113504154190',
    kaptCode: 'A13986306',
    matchRule: 'ROAD_KEY',
  });
});

test('맞추기: 도로명 키가 없는 공동주택은 필지(PNU)로 → LOT, 새 도로명 키가 단지에 붙는다', () => {
  const link = matchBuilding(
    parseBuildingLine(makeLine({ 10: '동일로207길', 12: '17', 16: '1135010600105040001000009', 7: '504', 8: '1' })),
    LOOKUP,
  );
  assert.equal(link.matchRule, 'LOT');
  assert.equal(link.kaptCode, 'A13986306');
  assert.equal(link.roadNameKey, '동일로207길');
  assert.equal(link.roadMainNo, 17);
});

test('맞추기: 공동주택 표시가 없어도 도로명 키가 같으면 NON_APT_FLAG, 번지만 같으면 연결하지 않음', () => {
  assert.equal(matchBuilding(parseBuildingLine(makeLine({ 27: '0' })), LOOKUP).matchRule, 'NON_APT_FLAG');
  const lotOnly = makeLine({ 27: '0', 10: '동일로207길', 12: '17', 16: '1135010600105040001000009' });
  assert.equal(matchBuilding(parseBuildingLine(lotOnly), LOOKUP), null);
});

test('맞추기: 한 주소에 분양·임대 단지가 같이 있으면 분양이 먼저', () => {
  const link = matchBuilding(parseBuildingLine(makeLine({ 1: '1135010400', 10: '동일로207길', 12: '186', 16: '1135010400103540000012711' })), LOOKUP);
  assert.equal(link.kaptCode, 'A13987305');
});

test('맞추기: 후보가 없으면 null', () => {
  assert.equal(matchBuilding(parseBuildingLine(makeLine({ 12: '999' })), LOOKUP), null);
});

test('단지 주소 칸 글자: 시도 시군구 (읍·면) 도로명 건물번호', () => {
  assert.equal(toRoadAddressText(parseBuildingLine(makeLine())), '서울특별시 노원구 섬밭로 285');
  assert.equal(
    toRoadAddressText(parseBuildingLine(makeLine({ 2: '경기도', 3: '가평군', 4: '가평읍', 10: '가화로', 12: '142', 13: '26', 11: '1' }))),
    '경기도 가평군 가평읍 가화로 지하 142-26',
  );
});
