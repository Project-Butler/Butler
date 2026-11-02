import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseJibunLot, parseJibunLots, parseRoadAddress, toRoadNameKey } from './kaptAddress.js';

test('도로명주소: 시도·시군구·도로명·본번', () => {
  assert.deepEqual(parseRoadAddress('서울특별시 송파구 올림픽로 435', '1171010200'), {
    sigunguCd: '11710',
    roadNameKey: '올림픽로',
    underground: false,
    mainNo: 435,
    subNo: 0,
  });
});

test('도로명주소: 번길·부번·괄호 참고항목', () => {
  assert.deepEqual(parseRoadAddress('경기도 의정부시 동일로522번길 49-3 (신곡동)', '4115010400'), {
    sigunguCd: '41150',
    roadNameKey: '동일로522번길',
    underground: false,
    mainNo: 49,
    subNo: 3,
  });
});

test('도로명주소: 시군구가 없는 세종은 법정동 코드에서 시군구를 가져온다', () => {
  assert.deepEqual(parseRoadAddress('세종특별자치시  해밀2로 67', '3611011600'), {
    sigunguCd: '36110',
    roadNameKey: '해밀2로',
    underground: false,
    mainNo: 67,
    subNo: 0,
  });
});

test('도로명주소: 시 아래 구·읍면이 있는 주소', () => {
  assert.equal(parseRoadAddress('경기도 수원시 장안구 정자로 100', '4111112900').roadNameKey, '정자로');
  assert.equal(parseRoadAddress('경기도 화성시 봉담읍 동화길 50', '4159025300').mainNo, 50);
  assert.equal(parseRoadAddress('강원특별자치도 홍천군 희망로17길 10', '5172025024').sigunguCd, '51720');
});

test('도로명주소: 지하', () => {
  const parsed = parseRoadAddress('서울특별시 중구 세종대로 지하 2', '1114010300');
  assert.equal(parsed.underground, true);
  assert.equal(parsed.mainNo, 2);
});

test('도로명주소: 전각 숫자도 읽는다', () => {
  assert.equal(parseRoadAddress('서울특별시 송파구 올림픽로 ４３５', '1171010200').mainNo, 435);
});

test('도로명주소: 줄인 시도·도로명에 붙은 건물번호·뒤의 단지명', () => {
  assert.deepEqual(parseRoadAddress('강원 태백시 고원로167 대윤아파트', '5119010100'), {
    sigunguCd: '51190',
    roadNameKey: '고원로',
    underground: false,
    mainNo: 167,
    subNo: 0,
  });
  assert.equal(parseRoadAddress('강원 태백시 고원로 167 대윤아파트', '5119010100').mainNo, 167);
  assert.equal(parseRoadAddress('경북 영주시 영주로 299 (휴천동) 영주A', '4721010100').roadNameKey, '영주로');
});

test('도로명주소: 시도가 빠진 주소(시군구부터)', () => {
  assert.deepEqual(parseRoadAddress('영주시 영주로299', '4721010100'), {
    sigunguCd: '47210',
    roadNameKey: '영주로',
    underground: false,
    mainNo: 299,
    subNo: 0,
  });
});

test('도로명주소: 숫자가 든 도로명은 건물번호로 나누지 않는다', () => {
  const parsed = parseRoadAddress('경기도 의정부시 동일로522번길49-3', '4115010400');
  assert.equal(parsed.roadNameKey, '동일로522번길');
  assert.equal(parsed.mainNo, 49);
  assert.equal(parsed.subNo, 3);
  assert.equal(parseRoadAddress('강원특별자치도 홍천군 희망로17길 10', '5172025024').roadNameKey, '희망로17길');
});

test('도로명주소: 형식이 맞지 않으면 null', () => {
  assert.equal(parseRoadAddress(null, '1171010200'), null);
  assert.equal(parseRoadAddress('', '1171010200'), null);
  assert.equal(parseRoadAddress('서울특별시 송파구 신천동 17', '1171010200'), null);
  assert.equal(parseRoadAddress('서울특별시 송파구 올림픽로', '1171010200'), null);
});

test('도로명주소: 법정동 코드가 없으면 시군구 코드만 null', () => {
  assert.equal(parseRoadAddress('서울특별시 송파구 올림픽로 435', null).sigunguCd, null);
});

test('도로명 키는 공백을 없앤다', () => {
  assert.equal(toRoadNameKey(' 올림픽 로 '), '올림픽로');
});

test('지번주소: 본번·부번', () => {
  assert.deepEqual(parseJibunLot('서울특별시 송파구 신천동 17 잠실파크리오'), { mainLot: 17, subLot: 0, isMountain: false });
  assert.deepEqual(parseJibunLot('경기도 의정부시 신곡동 419-18 e편한세상'), { mainLot: 419, subLot: 18, isMountain: false });
});

test('지번주소: 부번 자리가 비어 있거나 리 지역·산', () => {
  assert.deepEqual(parseJibunLot('세종특별자치시  해밀동 665- 라포르테세종'), { mainLot: 665, subLot: 0, isMountain: false });
  assert.deepEqual(parseJibunLot('강원특별자치도 홍천군 홍천읍 갈마곡리 562 홍천'), { mainLot: 562, subLot: 0, isMountain: false });
  assert.deepEqual(parseJibunLot('경기도 가평군 가평읍 읍내리 산12-3 OO'), { mainLot: 12, subLot: 3, isMountain: true });
});

test('지번주소: 번지가 없으면 null', () => {
  assert.equal(parseJibunLot('서울특별시 송파구 신천동 잠실파크리오'), null);
  assert.equal(parseJibunLot(undefined), null);
});

test('지번주소 목록: 엑셀처럼 쉼표로 이은 필지를 모두, 산·중복은 뺀다', () => {
  assert.deepEqual(
    parseJibunLots('서울특별시 노원구 중계동 504-1,서울특별시 노원구 중계동 503,서울특별시 노원구 중계동 502-1 중계그린'),
    [
      { mainLot: 504, subLot: 1 },
      { mainLot: 503, subLot: 0 },
      { mainLot: 502, subLot: 1 },
    ],
  );
  assert.deepEqual(parseJibunLots('경기도 가평군 가평읍 읍내리 산12-3,경기도 가평군 가평읍 읍내리 12, 경기도 가평군 가평읍 읍내리 12'), [
    { mainLot: 12, subLot: 0 },
  ]);
  assert.deepEqual(parseJibunLots(null), []);
});
