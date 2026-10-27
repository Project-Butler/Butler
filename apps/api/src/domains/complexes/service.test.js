// 단지 검색(juso → ROAD 키, 검색 저장본 쓰기)과 resolve(이미 있는 단지 → 검색 저장본으로 생성)를
// 가짜 prisma·provider로 확인한다(DB·외부 호출 없음).
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.JUSO_API_KEY = process.env.JUSO_API_KEY ?? 'test-key';
process.env.DATA_GO_KR_SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? 'test-key';

const { prisma } = await import('../../platform/prismaClient.js');
const { publicProvider } = await import('./provider/publicProvider.js');
const { findComplexById, resolveComplex, searchComplexes } = await import('./service.js');

const ROAD_KEY = 'ROAD:117103123006-0-435-0';
const REGION = {
  id: '1171010200',
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

const OTHER_BD_MGT_SN = '1171010200100290000000001';

const uniqueError =() => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

// complexes·address_search_results만 흉내 낸 메모리 DB
const createFakeDb = () => {
  const db = { complexes: [], saved: new Map(), rawWrites: [], beforeCreate: null, kaptRows: [], kaptError: null, kaptQueries: 0 };
  let nextId = 1;
  const withRegion = (complex) => (complex ? { ...complex, region: REGION } : null);

  db.addComplex = (sourceKey, extra = {}) => {
    const complex = {
      id: `c${nextId++}`,
      sourceKey,
      name: '잠실파크리오',
      regionId: REGION.id,
      buildingMgtNo: null,
      kaptCode: null,
      createdAt: new Date(),
      ...extra,
    };
    db.complexes.push(complex);
    return complex;
  };

  // where.OR = [{ sourceKey: { in } }, { buildingMgtNo: { in } }?]
  const matchesOr = (complex, conditions) =>
    conditions.some((condition) =>
      Object.entries(condition).every(([field, { in: values }]) => values.includes(complex[field])),
    );

  Object.assign(prisma, {
    complex: {
      findUnique: async ({ where }) =>
        withRegion(db.complexes.find((c) => (where.id ? c.id === where.id : c.sourceKey === where.sourceKey))),
      findFirst: async ({ where }) => withRegion(db.complexes.find((c) => c.buildingMgtNo === where.buildingMgtNo)),
      findMany: async ({ where }) =>
        db.complexes
          .filter((c) => matchesOr(c, where.OR))
          .map((c) => ({ id: c.id, sourceKey: c.sourceKey, buildingMgtNo: c.buildingMgtNo })),
      create: async ({ data }) => {
        if (db.beforeCreate) await db.beforeCreate();
        if (db.complexes.some((c) => c.sourceKey === data.sourceKey)) throw uniqueError();
        const complex = { ...data, id: `c${nextId++}`, createdAt: new Date() };
        db.complexes.push(complex);
        return withRegion(complex);
      },
    },
    addressCache: {
      findUnique: async ({ where }) => db.saved.get(where.sourceKey) ?? null,
    },
    region: { findUnique: async ({ where }) => (where.id === REGION.id ? { id: where.id } : null) },
    kaptComplex: { findUnique: async () => db.kaptBasis ?? null },
    $executeRaw: async (strings, ...values) => {
      db.rawWrites.push(values);
      return values[0].length;
    },
    // 연결 조회(kaptLinks.findKaptByRoadKeys): values[0] = 결과 index 배열. kaptRows의 idx로 돌려준다.
    $queryRaw: async () => {
      db.kaptQueries += 1;
      if (db.kaptError) throw db.kaptError;
      return db.kaptRows;
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
      legalDongCode: REGION.id,
      zipCode: '05507',
      officialBuildingName: '잠실파크리오',
      detailBuildingNames: ['101동', '102동'],
      isApartment: true,
      buildingMgtNo: PAYLOAD.bdMgtSn,
      payload: PAYLOAD,
    },
    {
      sourceKey: 'ROAD:117103123006-0-300-0',
      name: '서울특별시 송파구 올림픽로 300',
      jibunAddress: '서울특별시 송파구 신천동 29',
      roadAddress: '서울특별시 송파구 올림픽로 300',
      legalDongCode: REGION.id,
      zipCode: '05551',
      officialBuildingName: null,
      detailBuildingNames: [],
      isApartment: false,
      buildingMgtNo: OTHER_BD_MGT_SN,
      payload: { ...PAYLOAD, buldMnnm: '300', bdNm: null, bdMgtSn: OTHER_BD_MGT_SN },
    },
  ];
  delete process.env.ADDRESS_KAPT_ENRICHMENT;
});

test('검색: 응답에 우편번호·공식 건물명·상세건물명·공동주택 여부·kapt를 담는다', async () => {
  const db = createFakeDb();
  db.kaptRows = [
    { idx: 0, kaptCode: 'A2', name: '잠실파크리오(임대)', saleType: '임대' },
    { idx: 0, kaptCode: 'A9', name: '잠실파크리오', saleType: '분양' },
  ];

  const [first, second] = await searchComplexes({ query: '올림픽로', size: 20 });

  assert.equal(first.zipCode, '05507');
  assert.equal(first.officialBuildingName, '잠실파크리오');
  assert.deepEqual(first.detailBuildingNames, ['101동', '102동']);
  assert.equal(first.isApartment, true);
  // 분양이 임대보다 앞(kaptCode 순서와 관계없이)
  assert.deepEqual(first.kapt, { kaptCode: 'A9', name: '잠실파크리오', saleType: '분양' });
  assert.equal(second.kapt, null);
  assert.equal(second.isApartment, false);
  assert.equal(second.name, '서울특별시 송파구 올림픽로 300');
  assert.equal(db.kaptQueries, 1);
});

test('검색: 건물 이름이 없으면 연결된 K-apt 단지명을 이름으로 쓴다', async () => {
  const db = createFakeDb();
  db.kaptRows = [{ idx: 1, kaptCode: 'A3', name: '롯데캐슬', saleType: '혼합' }];

  const results = await searchComplexes({ query: '올림픽로', size: 20 });

  assert.equal(results[1].name, '롯데캐슬');
});

test('검색: ADDRESS_KAPT_ENRICHMENT=off면 연결 조회 없이 kapt null', async () => {
  const db = createFakeDb();
  db.kaptRows = [{ idx: 0, kaptCode: 'A9', name: '잠실파크리오', saleType: '분양' }];
  process.env.ADDRESS_KAPT_ENRICHMENT = 'off';

  const results = await searchComplexes({ query: '올림픽로', size: 20 });

  assert.equal(db.kaptQueries, 0);
  assert.deepEqual(results.map((row) => row.kapt), [null, null]);
});

test('검색: 연결 조회가 실패해도 검색은 성공하고 kapt null', async () => {
  const db = createFakeDb();
  db.kaptError = new Error('relation does not exist');

  const results = await searchComplexes({ query: '올림픽로', size: 20 });

  assert.equal(results.length, 2);
  assert.deepEqual(results.map((row) => row.kapt), [null, null]);
});

test('검색: 건물관리번호로 맞춘 기존 단지는 그 단지의 기존 sourceKey와 complexId, 저장본에 안 씀', async () => {
  const db = createFakeDb();
  // 도로명이 바뀌기 전 키로 만들어진 단지(같은 대표 건물관리번호)
  const old = db.addComplex('ROAD:117103100000-0-12-0', { buildingMgtNo: PAYLOAD.bdMgtSn });

  const results = await searchComplexes({ query: '올림픽로', size: 20 });

  assert.equal(results[0].sourceKey, old.sourceKey);
  assert.equal(results[0].complexId, old.id);
  assert.deepEqual(db.rawWrites[0][0], ['ROAD:117103123006-0-300-0']);
});

test('검색: ROAD 키로 찾은 단지가 건물관리번호 맞춤보다 먼저', async () => {
  const db = createFakeDb();
  db.addComplex('ROAD:117103100000-0-12-0', { buildingMgtNo: PAYLOAD.bdMgtSn });
  const exact = db.addComplex(ROAD_KEY, { buildingMgtNo: PAYLOAD.bdMgtSn });

  const results = await searchComplexes({ query: '올림픽로', size: 20 });

  assert.equal(results[0].sourceKey, ROAD_KEY);
  assert.equal(results[0].complexId, exact.id);
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
  assert.deepEqual(created.dongNames, ['101동', '102동']);
});

test('resolve: 저장본의 건물관리번호가 기존 단지와 같으면 새로 만들지 않고 그 단지', async () => {
  const db = createFakeDb();
  const old = db.addComplex('ROAD:117103100000-0-12-0', { buildingMgtNo: PAYLOAD.bdMgtSn });
  db.saved.set(ROAD_KEY, { sourceKey: ROAD_KEY, payload: PAYLOAD, fetchedAt: new Date() });

  const result = await resolveComplex(ROAD_KEY);

  assert.equal(result.id, old.id);
  assert.equal(db.complexes.length, 1);
});

test('resolve: 연결 표의 K-apt 단지로 kaptCode를 채우고 응답에 zipCode·kaptCode·detailBuildingNames', async () => {
  const db = createFakeDb();
  db.saved.set(ROAD_KEY, { sourceKey: ROAD_KEY, payload: PAYLOAD, fetchedAt: new Date() });
  db.kaptRows = [{ idx: 0, kaptCode: 'A10027875', name: '잠실파크리오', saleType: '분양' }];
  db.kaptBasis = { approvalDate: new Date('2008-08-01T00:00:00Z'), householdCount: 6864, buildingCount: 66 };

  const result = await resolveComplex(ROAD_KEY);

  assert.equal(db.complexes[0].kaptCode, 'A10027875');
  assert.equal(result.kaptCode, 'A10027875');
  assert.equal(result.zipCode, '05507');
  assert.deepEqual(result.detailBuildingNames, ['101동', '102동']);
  // 단지 자체 buildingInfo가 없으면 K-apt 값(사용승인일·세대수·동수), 나머지 null
  assert.deepEqual(result.buildingInfo, {
    approvalDate: '2008-08-01',
    householdCount: 6864,
    buildingCount: 66,
    maxFloor: null,
    parkingCount: null,
  });
});

test('상세: 단지 자체 buildingInfo가 있으면 그 값, K-apt도 없으면 null', async () => {
  const db = createFakeDb();
  db.kaptBasis = { approvalDate: null, householdCount: 1, buildingCount: 1 };
  const own = db.addComplex(ROAD_KEY, { kaptCode: 'A1', householdCount: 100, approvalDate: null, buildingCount: null, maxFloor: 20, parkingCount: null });
  const bare = db.addComplex('ROAD:117103123006-0-300-0', { kaptCode: null });

  assert.deepEqual((await findComplexById(own.id)).buildingInfo, {
    approvalDate: null,
    householdCount: 100,
    buildingCount: null,
    maxFloor: 20,
    parkingCount: null,
  });
  assert.equal((await findComplexById(bare.id)).buildingInfo, null);
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
