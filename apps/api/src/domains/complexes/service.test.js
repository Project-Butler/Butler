// 단지 검색(juso → ROAD 키, 검색 저장본 쓰기)과 resolve(이미 있는 단지 → 검색 저장본으로 생성)를
// 가짜 prisma·provider로 확인한다(DB·외부 호출 없음).
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.JUSO_API_KEY = process.env.JUSO_API_KEY ?? 'test-key';
process.env.DATA_GO_KR_SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? 'test-key';

const { prisma } = await import('../../platform/prismaClient.js');
const { publicProvider } = await import('./provider/publicProvider.js');
const { resolveComplex, searchComplexes } = await import('./service.js');

const ROAD_KEY = 'ROAD:117103123006-0-435-0';
const REGION = {
  legalDongCode: '1171010200',
  sidoName: '서울특별시',
  sigunguName: '송파구',
  dongName: '신천동',
  fullName: '서울특별시 송파구 신천동',
};
const PAYLOAD = {
  roadAddr: '서울특별시 송파구 올림픽로 435 (신천동)',
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
  detBdNmList: '101동, 102동,102동',
};

const uniqueError = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

// complexes·address_search_results만 흉내 낸 메모리 DB
const createFakeDb = () => {
  const db = { complexes: [], saved: new Map(), rawWrites: [], beforeCreate: null };
  let nextId = 1;
  const withRegion = (complex) => (complex ? { ...complex, region: REGION } : null);

  db.addComplex = (sourceKey) => {
    const complex = { id: `c${nextId++}`, sourceKey, name: '잠실파크리오', legalDongCode: REGION.legalDongCode, createdAt: new Date() };
    db.complexes.push(complex);
    return complex;
  };

  Object.assign(prisma, {
    complex: {
      findUnique: async ({ where }) =>
        withRegion(db.complexes.find((c) => (where.id ? c.id === where.id : c.sourceKey === where.sourceKey))),
      findMany: async ({ where }) =>
        db.complexes.filter((c) => where.sourceKey.in.includes(c.sourceKey)).map((c) => ({ id: c.id, sourceKey: c.sourceKey })),
      create: async ({ data }) => {
        if (db.beforeCreate) await db.beforeCreate();
        if (db.complexes.some((c) => c.sourceKey === data.sourceKey)) throw uniqueError();
        const complex = { ...data, id: `c${nextId++}`, createdAt: new Date() };
        db.complexes.push(complex);
        return withRegion(complex);
      },
    },
    addressSearchResult: {
      findUnique: async ({ where }) => db.saved.get(where.sourceKey) ?? null,
    },
    region: { findUnique: async ({ where }) => (where.legalDongCode === REGION.legalDongCode ? { legalDongCode: where.legalDongCode } : null) },
    $executeRaw: async (strings, ...values) => {
      db.rawWrites.push(values);
      return values[0].length;
    },
  });
  return db;
};

beforeEach(() => {
  publicProvider.searchComplexes = async () => [
    {
      sourceKey: ROAD_KEY,
      name: '잠실파크리오',
      jibunAddress: PAYLOAD.jibunAddr,
      roadAddress: '서울특별시 송파구 올림픽로 435',
      legalDongCode: REGION.legalDongCode,
      payload: PAYLOAD,
    },
    {
      sourceKey: 'ROAD:117103123006-0-300-0',
      name: '롯데월드몰',
      jibunAddress: '서울특별시 송파구 신천동 29',
      roadAddress: '서울특별시 송파구 올림픽로 300',
      legalDongCode: REGION.legalDongCode,
      payload: { ...PAYLOAD, buldMnnm: '300' },
    },
  ];
});

test('검색: 이미 있는 단지는 complexId를 채우고, 없는 결과만 저장본에 쓴다(payload는 응답에 없음)', async () => {
  const db = createFakeDb();
  const existing = db.addComplex(ROAD_KEY);

  const results = await searchComplexes({ query: '올림픽로', size: 20 });

  assert.equal(results[0].complexId, existing.id);
  assert.equal(results[1].complexId, null);
  assert.equal('payload' in results[0], false);
  assert.equal(db.rawWrites.length, 1);
  assert.deepEqual(db.rawWrites[0][0], ['ROAD:117103123006-0-300-0']);
});

test('resolve: 이미 있는 단지는 저장본 없이 그대로', async () => {
  const db = createFakeDb();
  const existing = db.addComplex(ROAD_KEY);

  const result = await resolveComplex(ROAD_KEY);

  assert.equal(result.id, existing.id);
  assert.equal(db.complexes.length, 1);
});

test('resolve: 24시간 안의 검색 저장본으로 단지를 만든다', async () => {
  const db = createFakeDb();
  db.saved.set(ROAD_KEY, { sourceKey: ROAD_KEY, payload: PAYLOAD, fetchedAt: new Date() });

  const result = await resolveComplex(ROAD_KEY);

  assert.equal(result.sourceKey, ROAD_KEY);
  assert.equal(result.name, '잠실파크리오');
  const created = db.complexes[0];
  assert.equal(created.zipCode, '05507');
  assert.equal(created.roadCode, '117103123006');
  assert.equal(created.sigunguCode, '11710');
  assert.equal(created.roadNameKey, '올림픽로');
  assert.equal(created.buildingMainNo, 435);
  assert.equal(created.buildingSubNo, 0);
  assert.equal(created.buildingMgtNo, PAYLOAD.bdMgtSn);
  assert.deepEqual(created.detailBuildingNames, ['101동', '102동']);
});

test('resolve: 저장본이 없거나 24시간이 지났으면 404 COMPLEX_SOURCE_NOT_FOUND', async () => {
  const db = createFakeDb();
  await assert.rejects(resolveComplex(ROAD_KEY), { code: 'COMPLEX_SOURCE_NOT_FOUND' });

  db.saved.set(ROAD_KEY, { sourceKey: ROAD_KEY, payload: PAYLOAD, fetchedAt: new Date(Date.now() - 25 * 3600 * 1000) });
  await assert.rejects(resolveComplex(ROAD_KEY), { code: 'COMPLEX_SOURCE_NOT_FOUND' });
  assert.equal(db.complexes.length, 0);
});

test('resolve: 법정동이 regions에 없으면 만들지 않고 404', async () => {
  const db = createFakeDb();
  db.saved.set(ROAD_KEY, { sourceKey: ROAD_KEY, payload: { ...PAYLOAD, admCd: '9999999999' }, fetchedAt: new Date() });

  await assert.rejects(resolveComplex(ROAD_KEY), { code: 'COMPLEX_SOURCE_NOT_FOUND' });
  assert.equal(db.complexes.length, 0);
});

test('resolve: 동시에 만든 쪽이 이기면(P2002) 다시 읽어 그 단지를 돌려준다', async () => {
  const db = createFakeDb();
  db.saved.set(ROAD_KEY, { sourceKey: ROAD_KEY, payload: PAYLOAD, fetchedAt: new Date() });
  let winner = null;
  db.beforeCreate = async () => {
    if (!winner) winner = db.addComplex(ROAD_KEY);
  };

  const result = await resolveComplex(ROAD_KEY);

  assert.equal(result.id, winner.id);
  assert.equal(db.complexes.length, 1);
});
