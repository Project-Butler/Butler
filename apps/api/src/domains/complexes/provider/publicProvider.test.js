// publicProvider.searchComplexes(juso → ROAD 키·검색 저장본 칸)를 가짜 fetch로 확인한다(외부 호출 없음).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';
import { publicProvider, toRoadSourceKey } from './publicProvider.js';

const JUSO_ROW = {
  roadAddr: '서울특별시 송파구 올림픽로 435 (신천동)',
  roadAddrPart1: '서울특별시 송파구 올림픽로 435',
  jibunAddr: '서울특별시 송파구 신천동 17 잠실파크리오',
  zipNo: '05507',
  admCd: '1171010200',
  rn: '올림픽로',
  rnMgtSn: '117103123006',
  udrtYn: '0',
  buldMnnm: '435',
  buldSlno: '0',
  mtYn: '0',
  lnbrMnnm: '17',
  lnbrSlno: '0',
  bdMgtSn: '1171010200100170000000001',
  bdNm: '잠실파크리오',
  bdKdcd: '1',
  detBdNmList: '101동,102동',
};

let jusoRows;
let calls;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  jusoRows = [];
  calls = [];
  process.env.JUSO_API_KEY = 'test-key';
  globalThis.fetch = async (url) => {
    calls.push(new URL(url).pathname.split('/').pop());
    return { ok: true, text: async () => JSON.stringify({ results: { common: { errorCode: '0' }, juso: jusoRows } }) };
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('ROAD 키: 도로명코드·지하 여부·건물본번·부번으로 만든다', () => {
  assert.equal(toRoadSourceKey(JUSO_ROW), 'ROAD:117103123006-0-435-0');
  assert.equal(toRoadSourceKey({ ...JUSO_ROW, udrtYn: '1', buldSlno: '12' }), 'ROAD:117103123006-1-435-12');
  // 같은 주소를 다른 표기로 받아도(앞뒤 공백, 숫자 앞 0) 같은 키
  assert.equal(toRoadSourceKey({ ...JUSO_ROW, rnMgtSn: ' 117103123006 ', buldMnnm: '0435' }), 'ROAD:117103123006-0-435-0');
  assert.equal(toRoadSourceKey({ ...JUSO_ROW, rnMgtSn: '' }), null);
  assert.equal(toRoadSourceKey({ ...JUSO_ROW, buldMnnm: '0' }), null);
});

test('검색: juso 결과를 거르지 않고(상가 포함) 순서대로, 같은 키는 첫 번째만', async () => {
  jusoRows = [
    JUSO_ROW,
    { ...JUSO_ROW, bdNm: '', bdKdcd: '0', buldMnnm: '300', bdMgtSn: 'x' },
    { ...JUSO_ROW, bdNm: '중복' },
  ];

  const items = await publicProvider.searchComplexes('올림픽로', 20);

  assert.deepEqual(calls, ['addrLinkApi.do']);
  assert.deepEqual(
    items.map((item) => [item.sourceKey, item.name]),
    [
      ['ROAD:117103123006-0-435-0', '잠실파크리오'],
      ['ROAD:117103123006-0-300-0', '서울특별시 송파구 올림픽로 435'],
    ],
  );
  assert.equal(items[0].legalDongCode, '1171010200');
  assert.equal(items[0].payload.bdMgtSn, JUSO_ROW.bdMgtSn);
  assert.equal(items[0].payload.detBdNmList, '101동,102동');
  assert.equal('bdKdcd' in items[0].payload, false);
});

test('검색: 응답 칸(우편번호·공식 건물명·상세건물명·공동주택 여부·건물관리번호)', async () => {
  jusoRows = [JUSO_ROW, { ...JUSO_ROW, buldMnnm: '300', bdKdcd: '0', bdNm: '', detBdNmList: '' }];

  const [apartment, store] = await publicProvider.searchComplexes('올림픽로', 20);

  assert.equal(apartment.zipCode, '05507');
  assert.equal(apartment.officialBuildingName, '잠실파크리오');
  assert.deepEqual(apartment.detailBuildingNames, ['101동', '102동']);
  assert.equal(apartment.isApartment, true);
  assert.equal(apartment.buildingMgtNo, JUSO_ROW.bdMgtSn);
  assert.equal(store.isApartment, false);
  assert.equal(store.officialBuildingName, null);
  assert.deepEqual(store.detailBuildingNames, []);
});

// juso 실제 응답 고정 표본(학여울청구·중계그린). 모든 행에 도로명코드(rnMgtSn)와 건물관리번호(bdMgtSn)가
// 있어야 ROAD 키와 도로명 변경 대응(건물관리번호로 기존 단지 찾기)이 동작한다.
test('juso 고정 표본: 모든 행에 rnMgtSn·bdMgtSn이 있고, 거르지 않고(상가 포함) 결과가 된다', async () => {
  const fixtureUrl = new URL('./fixtures/juso-search-sample.json', import.meta.url);
  const { rows } = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  assert.ok(rows.length >= 3);
  for (const row of rows) {
    assert.match(String(row.rnMgtSn), /^\d{12}$/, row.roadAddr);
    assert.match(String(row.bdMgtSn), /^\d{25}$/, row.roadAddr);
  }

  jusoRows = rows;
  const items = await publicProvider.searchComplexes('학여울청구', 50);

  assert.equal(items.length, new Set(rows.map((row) => toRoadSourceKey(row))).size);
  for (const item of items) {
    assert.match(item.sourceKey, /^ROAD:\d{12}-[01]-\d+-\d+$/);
    assert.match(item.payload.rnMgtSn, /^\d{12}$/);
    assert.match(item.payload.bdMgtSn, /^\d{25}$/);
  }
  // 학여울청구 3건: 상가(bdKdcd 0) 포함
  const hakyeoul = items.filter((item) => item.officialBuildingName === '학여울청구아파트');
  assert.equal(hakyeoul.length, 3);
  assert.equal(hakyeoul.filter((item) => !item.isApartment).length, 1);
});

test('검색: 검색어 오류 코드는 결과 없음, 그 밖의 오류 코드는 ExternalServiceError', async () => {
  globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ results: { common: { errorCode: 'E0005' } } }) });
  assert.deepEqual(await publicProvider.searchComplexes('ㅁ', 20), []);

  globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ results: { common: { errorCode: 'E0001' } } }) });
  await assert.rejects(publicProvider.searchComplexes('올림픽로', 20), { reason: 'juso errorCode E0001' });
});
