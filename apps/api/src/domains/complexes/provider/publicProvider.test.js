// publicProvider.searchComplexes(juso → ROAD 키·검색 저장본 칸)를 가짜 fetch로 확인한다(외부 호출 없음).
import assert from 'node:assert/strict';
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

test('검색: 검색어 오류 코드는 결과 없음, 그 밖의 오류 코드는 ExternalServiceError', async () => {
  globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ results: { common: { errorCode: 'E0005' } } }) });
  assert.deepEqual(await publicProvider.searchComplexes('ㅁ', 20), []);

  globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ results: { common: { errorCode: 'E0001' } } }) });
  await assert.rejects(publicProvider.searchComplexes('올림픽로', 20), { reason: 'juso errorCode E0001' });
});
