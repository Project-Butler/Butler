// publicProvider.getUnitInfo(동 조회 정보 캐시 분기)와 resolve의 K-apt 기본정보 대체 경로를
// 가짜 prisma·fetch로 확인한다(DB·외부 호출 없음).
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { prisma } from '../../../platform/prismaClient.js';
import { publicProvider } from './publicProvider.js';

const PNU = '1171010200100170000';
const OTHER_PNU = '1171010200100180000';
const COMPLEX = {
  id: 'c1',
  sourceKey: `PNU:${PNU}`,
  name: '잠실파크리오',
  jibunAddress: '서울특별시 송파구 신천동 17',
  roadAddress: null,
  legalDongCode: '1171010200',
};

// ---------------------------------------------------------------- 가짜 fetch

const dataGoKr = (items) => ({
  ok: true,
  text: async () => JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: items } } } }),
});

// titlesByPnu: { [pnu]: [{ dongNm }] }, exposByKey: { 'pnu|dongNm|hoNm': rows }
let titlesByPnu;
let exposByKey;
let jusoRows;
let calls;

const exposRow = (dongNm, hoNm) => ({ exposPubuseGbCdNm: '전유', dongNm, hoNm, area: '35.24', flrNo: '12' });

beforeEach(() => {
  titlesByPnu = {};
  exposByKey = {};
  jusoRows = [];
  calls = [];
  process.env.DATA_GO_KR_SERVICE_KEY = 'test-key';
  process.env.JUSO_API_KEY = 'test-key';
  delete process.env.COMPLEX_UNIT_LOOKUP_CACHE;
  globalThis.fetch = async (url) => {
    const { pathname, searchParams } = new URL(url);
    const api = pathname.split('/').pop();
    calls.push(api);
    if (api === 'addrLinkApi.do') {
      return { ok: true, text: async () => JSON.stringify({ results: { common: { errorCode: '0' }, juso: jusoRows } }) };
    }
    const get = (name) => searchParams.get(name) ?? '';
    const pnu = `${get('sigunguCd')}${get('bjdongCd')}${get('platGbCd') === '1' ? '2' : '1'}${get('bun')}${get('ji')}`;
    if (api === 'getBrTitleInfo') return dataGoKr(titlesByPnu[pnu] ?? []);
    if (api === 'getBrExposPubuseAreaInfo') {
      return dataGoKr(exposByKey[`${pnu}|${searchParams.get('dongNm') ?? ''}|${searchParams.get('hoNm')}`] ?? []);
    }
    throw new Error(`unexpected api ${api}`);
  };
});

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------- 가짜 prisma

// 모든 모델 호출을 기록한다. stored: 저장된 동 조회 정보, miss: 음성 캐시 행
const fakePrisma = ({ stored = null, miss = null, aliases = [], kaptRow = null } = {}) => {
  const log = [];
  const record = (name, result) => async (args) => {
    log.push({ name, args });
    return typeof result === 'function' ? result(args) : result;
  };
  Object.assign(prisma, {
    complexBuildingLookup: {
      findUnique: record('lookup.findUnique', stored),
      upsert: record('lookup.upsert', null),
      update: record('lookup.update', null),
    },
    complexLookupMiss: {
      findUnique: record('miss.findUnique', miss),
      upsert: record('miss.upsert', null),
      deleteMany: record('miss.deleteMany', { count: 0 }),
    },
    complexSourceAlias: { findMany: record('alias.findMany', aliases) },
    kaptComplex: {
      findUnique: record('kapt.findUnique', kaptRow),
      findMany: record('kapt.findMany', []),
      update: record('kapt.update', null),
    },
    region: { findUnique: record('region.findUnique', null) },
    $queryRaw: record('queryRaw', [{ count: 1 }]),
  });
  return log;
};
const names = (log) => log.map((entry) => entry.name);

// ---------------------------------------------------------------- getUnitInfo

test('동·호: 캐시 플래그가 꺼져 있으면 prisma를 부르지 않는다(이전 방식)', async () => {
  process.env.COMPLEX_UNIT_LOOKUP_CACHE = 'off';
  const log = fakePrisma();
  exposByKey[`${PNU}|101동|1203`] = [exposRow('101동', '1203')];

  const info = await publicProvider.getUnitInfo({ complex: COMPLEX, buildingNo: '101', unitNo: '1203' });

  assert.deepEqual(info, { exclusiveArea: 35.24, floor: 12 });
  assert.deepEqual(log, []);
});

test('동·호: 저장된 방법으로 찾으면 전유부 1회로 끝낸다', async () => {
  const log = fakePrisma({ stored: { pnu: PNU, registryDongNm: '101동', hoFormat: 'N', missCount: 0 } });
  exposByKey[`${PNU}|101동|1203`] = [exposRow('101동', '1203')];

  const info = await publicProvider.getUnitInfo({ complex: COMPLEX, buildingNo: '101', unitNo: '1203' });

  assert.deepEqual(info, { exclusiveArea: 35.24, floor: 12 });
  assert.deepEqual(calls, ['getBrExposPubuseAreaInfo']);
  assert.deepEqual(names(log), ['lookup.findUnique', 'miss.findUnique']);
});

test('동·호: 저장된 동은 있고 호만 없으면 저장값을 두고 연속 실패 수만 원자적으로 +1', async () => {
  const log = fakePrisma({ stored: { pnu: PNU, registryDongNm: '101동', hoFormat: 'N', missCount: 0 } });
  titlesByPnu[PNU] = [{ dongNm: '101동' }];

  const info = await publicProvider.getUnitInfo({ complex: COMPLEX, buildingNo: '101', unitNo: '9999' });

  assert.equal(info, null);
  const update = log.find((entry) => entry.name === 'lookup.update');
  assert.deepEqual(update.args.data, { missCount: { increment: 1 } });
  assert.deepEqual(update.args.where, { complexId_dongKey: { complexId: 'c1', dongKey: '101' } });
  assert.equal(names(log).includes('lookup.upsert'), false);
  assert.equal(names(log).includes('miss.upsert'), false);
  // 찾기 절차(juso)로 가지 않는다
  assert.equal(calls.includes('addrLinkApi.do'), false);
});

test('동·호: 저장된 필지에 동이 없어졌으면 찾기 절차로 다른 필지에서 찾아 덮어쓴다', async () => {
  const log = fakePrisma({
    stored: { pnu: OTHER_PNU, registryDongNm: '101동', hoFormat: 'N', missCount: 0 },
  });
  titlesByPnu[OTHER_PNU] = [{ dongNm: '201동' }];
  titlesByPnu[PNU] = [{ dongNm: '101동' }];
  exposByKey[`${PNU}|101동|1203`] = [exposRow('101동', '1203')];

  const info = await publicProvider.getUnitInfo({ complex: COMPLEX, buildingNo: '101', unitNo: '1203' });

  assert.deepEqual(info, { exclusiveArea: 35.24, floor: 12 });
  const upsert = log.find((entry) => entry.name === 'lookup.upsert');
  assert.equal(upsert.args.update.pnu, PNU);
  assert.equal(upsert.args.update.registryDongNm, '101동');
  assert.equal(upsert.args.update.missCount, 0);
});

test('동·호: 필지를 봤는데 동이 없으면 음성 캐시를 쓴다', async () => {
  const log = fakePrisma();
  titlesByPnu[PNU] = [{ dongNm: '201동' }];

  const info = await publicProvider.getUnitInfo({ complex: COMPLEX, buildingNo: '101', unitNo: '1203' });

  assert.equal(info, null);
  const upsert = log.find((entry) => entry.name === 'miss.upsert');
  assert.equal(upsert.args.create.reason, 'dong not found');
});

test('동·호: 후보 필지가 하나도 없으면 음성 캐시를 쓰지 않는다(동이 없다는 뜻이 아님)', async () => {
  const log = fakePrisma();
  const complex = { ...COMPLEX, sourceKey: 'KAPT:A00000000', jibunAddress: null, roadAddress: null };

  const info = await publicProvider.getUnitInfo({ complex, buildingNo: '101', unitNo: '1203' });

  assert.equal(info, null);
  assert.equal(names(log).includes('miss.upsert'), false);
  assert.deepEqual(calls, []);
});

test('동·호: 음성 캐시가 살아 있으면 외부 호출 없이 null', async () => {
  fakePrisma({ miss: { expiresAt: new Date(Date.now() + 60000) } });

  const info = await publicProvider.getUnitInfo({ complex: COMPLEX, buildingNo: '101', unitNo: '1203' });

  assert.equal(info, null);
  assert.deepEqual(calls, []);
});

// ---------------------------------------------------------------- resolve: K-apt 기본정보 대체

const KAPT_ROW = {
  kaptCode: 'A13824006',
  name: '잠실파크리오',
  legalDongCode: '1171010200',
  jibunAddress: '서울특별시 송파구 신천동 17',
  roadAddress: '서울특별시 송파구 올림픽로 435',
  sidoName: '서울특별시',
  sigunguName: '송파구',
  dongName: '신천동',
  riName: null,
};

const gatewayResponse = (code) => ({
  ok: true,
  text: async () => JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: code } } }),
});

for (const [label, response] of [
  ['하루 한도(게이트웨이 22)', () => gatewayResponse('22')],
  ['잠시 차단(게이트웨이 04)', () => gatewayResponse('04')],
  ['HTTP 429', () => ({ ok: false, status: 429, text: async () => '' })],
  ['HTTP 503', () => ({ ok: false, status: 503, text: async () => '' })],
]) {
  test(`resolve: K-apt 기본정보가 ${label}이면 503 대신 단지 목록 값으로 만든다`, async () => {
    fakePrisma({ kaptRow: KAPT_ROW });
    globalThis.fetch = async () => response();

    const complex = await publicProvider.getComplexBySourceKey('KAPT:A13824006');

    assert.equal(complex.name, '잠실파크리오');
    assert.equal(complex.roadAddress, KAPT_ROW.roadAddress);
    assert.equal(complex.buildingInfo, null);
  });
}

test('resolve: K-apt 기본정보가 시간 초과여도 목록 값으로 만든다', async () => {
  fakePrisma({ kaptRow: KAPT_ROW });
  globalThis.fetch = async () => {
    throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  };

  const complex = await publicProvider.getComplexBySourceKey('KAPT:A13824006');
  assert.equal(complex.buildingInfo, null);
});

test('resolve: 목록에도 없거나 다른 실패면 원래 에러를 던진다', async () => {
  fakePrisma({ kaptRow: null });
  globalThis.fetch = async () => gatewayResponse('22');
  await assert.rejects(publicProvider.getComplexBySourceKey('KAPT:A13824006'), { reason: 'kapt-basis gateway 22' });

  fakePrisma({ kaptRow: KAPT_ROW });
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => '' });
  await assert.rejects(publicProvider.getComplexBySourceKey('KAPT:A13824006'), { reason: 'kapt-basis HTTP 500' });
});

// ---------------------------------------------------------------- 같은 건물 키

test('별칭: kapt_complexes 행이 없으면 받아 온 기본정보 지번으로 PNU 키', async () => {
  fakePrisma({ kaptRow: null });
  const keys = await publicProvider.getLinkedSourceKeys('KAPT:A13824006', {
    bjdCode: '1171010200',
    jibunAddress: '서울특별시 송파구 신천동 17 잠실파크리오',
  });
  assert.deepEqual(keys, ['KAPT:A13824006', `PNU:${PNU}`]);
});

test('별칭: 산 PNU는 법정동+본번으로 K-apt 단지를 고르지 않는다', async () => {
  const log = fakePrisma();
  prisma.kaptComplex.findMany = async () => [{ kaptCode: 'A1', jibunAddress: '서울특별시 송파구 신천동 17' }];
  const keys = await publicProvider.getLinkedSourceKeys('PNU:1171010200200170000', {
    jibunAddress: '서울특별시 송파구 신천동 산17',
  });
  assert.deepEqual(keys, ['PNU:1171010200200170000']);
  assert.equal(names(log).includes('kapt.findMany'), false);
});

test('동·호: 건축HUB는 HTTP 429·503만 한 번 더 부르고 시간 초과는 다시 부르지 않는다', async () => {
  const run = async (failure) => {
    fakePrisma({ stored: { pnu: PNU, registryDongNm: '101동', hoFormat: 'N', missCount: 0 } });
    let exposCalls = 0;
    globalThis.fetch = async () => {
      exposCalls += 1;
      return failure();
    };
    await publicProvider.getUnitInfo({ complex: COMPLEX, buildingNo: '101', unitNo: '1203' }).catch(() => null);
    return exposCalls;
  };
  const timeout = () => {
    throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  };
  const throttled = () => ({ ok: false, status: 429, text: async () => '' });

  // 저장된 방법 1회 → 찾기 절차(juso 1회, 후보 필지 표제부 1회). 429면 건축HUB 호출마다 1회씩 더 부른다.
  assert.equal(await run(timeout), 3);
  assert.equal(await run(throttled), 5);
});
