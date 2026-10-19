import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chooseSearchIdentity,
  isFlagOn,
  linkJusoRowsToKapt,
  mergeSearchGroups,
  toJusoLotKey,
  toJusoRoadKey,
  toLotKeyString,
  toRoadKeyString,
} from './complexMatching.js';

// juso 아파트 행(필요한 칸만)
const juso = (overrides) => ({
  bdNm: '스카이빌',
  admCd: '3017011200',
  rn: '대덕대로',
  udrtYn: '0',
  buldMnnm: '100',
  buldSlno: '0',
  mtYn: '0',
  lnbrMnnm: '1000',
  lnbrSlno: '0',
  ...overrides,
});

const roadKeyOf = (row) => toRoadKeyString(toJusoRoadKey(row));
const lotKeyOf = (row) => toLotKeyString(toJusoLotKey(row));

const link = (rows, { road = {}, lot = {} } = {}) =>
  linkJusoRowsToKapt(rows, {
    kaptCodesByRoadKey: new Map(Object.entries(road)),
    kaptCodesByLotKey: new Map(Object.entries(lot)),
  });

test('플래그: 기본은 켬, off·false·0만 끔', () => {
  assert.equal(isFlagOn(undefined), true);
  assert.equal(isFlagOn('on'), true);
  assert.equal(isFlagOn('OFF'), false);
  assert.equal(isFlagOn('false'), false);
  assert.equal(isFlagOn('0'), false);
});

test('juso 도로명 키: 시군구 5자리·공백 없는 도로명·지하·본번·부번', () => {
  assert.deepEqual(toJusoRoadKey(juso({ admCd: '1171010200', rn: '올림픽 로', buldMnnm: '435', buldSlno: '0' })), {
    roadSigunguCd: '11710',
    roadNameKey: '올림픽로',
    roadUnderground: false,
    roadMainNo: 435,
    roadSubNo: 0,
  });
  assert.equal(toJusoRoadKey(juso({ udrtYn: '1', buldSlno: '3' })).roadUnderground, true);
  assert.equal(toJusoRoadKey(juso({ buldSlno: '3' })).roadSubNo, 3);
  assert.equal(toJusoRoadKey(juso({ rn: '' })), null);
  assert.equal(toJusoRoadKey(juso({ buldMnnm: '0' })), null);
});

test('juso 지번 키: 산 번지는 쓰지 않는다', () => {
  assert.deepEqual(toJusoLotKey(juso({})), { legalDongCode: '3017011200', mainLot: 1000 });
  assert.equal(toJusoLotKey(juso({ mtYn: '1' })), null);
});

test('1. 도로명 키가 K-apt 단지 하나와 맞으면 연결', () => {
  const row = juso({ bdNm: 'SKYVILLE' });
  assert.deepEqual(link([row], { road: { [roadKeyOf(row)]: ['A10021581'] } }), [{ kaptCode: 'A10021581', via: 'road' }]);
});

test('1. 도로명 키가 둘 이상 단지와 맞으면 애매함(연결 안 함)', () => {
  const row = juso({});
  assert.deepEqual(link([row], { road: { [roadKeyOf(row)]: ['A1', 'A2'] } }), [{ ambiguous: true }]);
});

test('2. 같은 이름·같은 리 코드·가까운 본번 형제 건물은 같은 단지', () => {
  const linked = juso({ buldMnnm: '100', lnbrMnnm: '1000' });
  const sibling = juso({ buldMnnm: '102', lnbrMnnm: '1005' });
  const far = juso({ buldMnnm: '104', lnbrMnnm: '1100' });
  const otherDong = juso({ buldMnnm: '106', admCd: '3017011300', lnbrMnnm: '1001' });
  const otherName = juso({ bdNm: '다른아파트', buldMnnm: '108', lnbrMnnm: '1001' });
  const links = link([linked, sibling, far, otherDong, otherName], { road: { [roadKeyOf(linked)]: ['A1'] } });
  assert.deepEqual(links, [{ kaptCode: 'A1', via: 'road' }, { kaptCode: 'A1', via: 'sibling' }, null, null, null]);
});

test('2. 형제 건물이 서로 다른 단지 둘에 연결되면 애매함', () => {
  const a = juso({ buldMnnm: '100' });
  const b = juso({ buldMnnm: '102' });
  const c = juso({ buldMnnm: '104' });
  const links = link([a, b, c], { road: { [roadKeyOf(a)]: ['A1'], [roadKeyOf(b)]: ['A2'] } });
  assert.deepEqual(links[2], { ambiguous: true });
});

test('3. 법정동(리)+본번은 후보가 하나일 때만, 둘이면 이름 비교로 넘김', () => {
  const row = juso({});
  assert.deepEqual(link([row], { lot: { [lotKeyOf(row)]: ['A9'] } }), [{ kaptCode: 'A9', via: 'lot' }]);
  assert.deepEqual(link([row], { lot: { [lotKeyOf(row)]: ['A9', 'A8'] } }), [null]);
  assert.deepEqual(link([row]), [null]);
});

test('도로명이 애매하면 본번 단계로 넘어가지 않는다', () => {
  const row = juso({});
  const links = link([row], { road: { [roadKeyOf(row)]: ['A1', 'A2'] }, lot: { [lotKeyOf(row)]: ['A1'] } });
  assert.deepEqual(links, [{ ambiguous: true }]);
});

const KAPT = 'KAPT:A1';
const PNU = 'PNU:3017011200110000000';
const linkedItem = { sourceKey: KAPT, linkedKeys: [KAPT, PNU] };

test('별칭: 연결 정보가 없으면 자기 키의 소유 단지', () => {
  assert.deepEqual(chooseSearchIdentity({ sourceKey: PNU }, new Map([[PNU, 'd']])), {
    sourceKey: PNU,
    complexId: 'd',
    split: false,
  });
});

test('별칭: KAPT 키가 단지 C의 별칭이면 C (PNU 별칭이 없거나 C에 있음)', () => {
  assert.deepEqual(chooseSearchIdentity(linkedItem, new Map([[KAPT, 'c']])), { sourceKey: KAPT, complexId: 'c', split: false });
  assert.deepEqual(chooseSearchIdentity(linkedItem, new Map([[KAPT, 'c'], [PNU, 'c']])), {
    sourceKey: KAPT,
    complexId: 'c',
    split: false,
  });
  assert.deepEqual(chooseSearchIdentity(linkedItem, new Map()), { sourceKey: KAPT, complexId: null, split: false });
});

test('별칭: PNU 키가 다른 단지 D의 별칭이면 PNU(D)로 폴백, KAPT도 다른 단지에 있으면 split', () => {
  assert.deepEqual(chooseSearchIdentity(linkedItem, new Map([[KAPT, 'c'], [PNU, 'd']])), {
    sourceKey: PNU,
    complexId: 'd',
    split: true,
  });
  assert.deepEqual(chooseSearchIdentity(linkedItem, new Map([[PNU, 'd']])), { sourceKey: PNU, complexId: 'd', split: false });
});

test('정렬: 연결 결과가 단지명 완전일치보다 앞, 이름 검색 항목은 주소 검색 항목으로 바뀜', () => {
  const linked = [{ sourceKey: 'KAPT:A1', name: 'road' }];
  const exact = [
    { sourceKey: 'KAPT:A2', name: 'exact', fromName: true },
    { sourceKey: 'KAPT:A1', name: 'exact-dup', fromName: true },
  ];
  const rest = [{ sourceKey: 'PNU:1', name: 'pnu' }, { sourceKey: 'KAPT:A2', name: 'juso-A2' }];
  const partial = [{ sourceKey: 'KAPT:A3', name: 'partial', fromName: true }];
  assert.deepEqual(
    mergeSearchGroups([linked, exact, rest, partial], 10).map((item) => item.name),
    ['road', 'juso-A2', 'pnu', 'partial'],
  );
  assert.deepEqual(mergeSearchGroups([linked, exact, rest, partial], 2).map((item) => item.name), ['road', 'exact']);
});

test('정렬: 연결 결과가 없으면(플래그 끔) 이전 순서 그대로', () => {
  const exact = [{ sourceKey: 'KAPT:A2', name: 'exact', fromName: true }];
  const rest = [{ sourceKey: 'PNU:1', name: 'pnu' }, { sourceKey: 'KAPT:A4', name: 'name-matched' }];
  assert.deepEqual(mergeSearchGroups([[], exact, rest, []], 10).map((item) => item.name), ['exact', 'pnu', 'name-matched']);
});
