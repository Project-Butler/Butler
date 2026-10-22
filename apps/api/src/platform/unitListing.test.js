import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EQUIPMENT_CODES, UNIT_TYPES, parseListingFields, toListing } from './unitListing.js';

test('상수: 방 구성 6종, 설비 15종(중복 없음)', () => {
  assert.deepEqual(UNIT_TYPES, ['ONE_ROOM', 'TWO_ROOM', 'THREE_ROOM', 'OFFICETEL', 'STORE', 'OTHER']);
  assert.equal(EQUIPMENT_CODES.length, 15);
  assert.equal(new Set(EQUIPMENT_CODES).size, 15);
  assert.ok(EQUIPMENT_CODES.every((code) => code.length <= 30)); // equipment VarChar(30)[]
});

test('검증: 상수 값만, 설비는 중복을 없애고 상수 순서로', () => {
  const details = [];
  const listing = parseListingFields(
    { unitType: 'TWO_ROOM', equipment: ['TV', 'AIR_CONDITIONER', 'TV'], equipmentEtc: '  건조기  ' },
    details,
  );
  assert.deepEqual(details, []);
  assert.deepEqual(listing, { unitType: 'TWO_ROOM', equipment: ['AIR_CONDITIONER', 'TV'], equipmentEtc: '건조기' });
});

test('검증: 틀린 값은 칸마다 400 사유', () => {
  const details = [];
  parseListingFields({ unitType: 'PENTHOUSE', equipment: ['TV', 'SAUNA'], equipmentEtc: 'x'.repeat(201) }, details);
  assert.deepEqual(
    details.map((detail) => detail.field),
    ['unitType', 'equipment', 'equipmentEtc'],
  );

  const notArray = [];
  parseListingFields({ equipment: 'TV' }, notArray);
  assert.equal(notArray[0].field, 'equipment');
});

test('검증: null은 비우기, 오지 않은 칸은 키 없음(이어받기 대상)', () => {
  const details = [];
  assert.deepEqual(parseListingFields({ unitType: null, equipment: null, equipmentEtc: '   ' }, details), {
    unitType: null,
    equipment: [],
    equipmentEtc: null,
  });
  assert.deepEqual(parseListingFields({}, details), {});
  assert.equal(parseListingFields({ equipmentEtc: 'x'.repeat(200) }, details).equipmentEtc.length, 200);
  assert.deepEqual(details, []);
});

test('응답: 값이 없으면 null·빈 배열', () => {
  assert.deepEqual(toListing({}), { unitType: null, equipment: [], equipmentEtc: null });
});
