import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { fillKaptBasis, MAX_BASIS_ATTEMPTS, toKaptBasisColumns } from './kaptBasis.js';

const NOW = new Date('2026-10-20T03:00:00Z');

const PARKRIO_ITEM = {
  kaptCode: 'A13824006',
  kaptName: '잠실파크리오',
  kaptAddr: '서울특별시 송파구 신천동 17 잠실파크리오',
  doroJuso: '서울특별시 송파구 올림픽로 435',
  bjdCode: '1171010200',
  codeSaleNm: '분양',
  kaptdaCnt: 6864,
  kaptDongCnt: '66',
  kaptUsedate: '20080829',
};

test('기본정보 → kapt_complexes 칸(분양형태·세대수·동수·사용승인일 포함, 도로명 키 칸은 쓰지 않는다)', () => {
  assert.deepEqual(toKaptBasisColumns(PARKRIO_ITEM, NOW), {
    roadAddress: '서울특별시 송파구 올림픽로 435',
    jibunAddress: '서울특별시 송파구 신천동 17 잠실파크리오',
    mainLot: 17,
    subLot: 0,
    saleType: '분양',
    householdCount: 6864,
    buildingCount: 66,
    approvalDate: new Date('2008-08-29T00:00:00.000Z'),
    basisSource: 'API',
    basisFetchedAt: NOW,
    basisError: null,
  });
});

test('기본정보: 날짜·수가 아니면 null', () => {
  const columns = toKaptBasisColumns({ ...PARKRIO_ITEM, kaptUsedate: '2008', kaptdaCnt: '', kaptDongCnt: null, codeSaleNm: ' ' }, NOW);
  assert.equal(columns.approvalDate, null);
  assert.equal(columns.householdCount, null);
  assert.equal(columns.buildingCount, null);
  assert.equal(columns.saleType, null);
});

test('도로명주소가 없거나 못 읽어도 원문·지번은 저장한다', () => {
  const columns = toKaptBasisColumns({ ...PARKRIO_ITEM, doroJuso: '알 수 없는 주소' }, NOW);
  assert.equal(columns.roadAddress, '알 수 없는 주소');
  assert.equal(columns.mainLot, 17);
  assert.equal(toKaptBasisColumns({ ...PARKRIO_ITEM, doroJuso: ' ' }, NOW).roadAddress, null);
});

// ---------------------------------------------------------------- fillKaptBasis (가짜 prisma·fetch)

const createFakePrisma = ({ rowCount, usage = 0 }) => {
  const state = { usage, updates: [], findManyArgs: null, links: [] };
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    kaptCode: `A${String(i).padStart(8, '0')}`,
    legalDongCode: '1171010200',
    sidoName: '서울특별시',
  }));
  const prisma = {
    kaptComplex: {
      findMany: async (args) => {
        state.findManyArgs = args;
        return rows.slice(0, args.take);
      },
      update: async (args) => {
        state.updates.push(args);
      },
    },
    // KAPT_API 연결 upsert: VALUES 순서(시군구, 도로명 키, 지하, 본번, 부번, 단지 코드)
    $executeRaw: async (strings, ...values) => {
      state.links.push(values);
      return 1;
    },
    // spendApiCall: limit 값은 마지막 파라미터
    $queryRaw: async (strings, ...values) => {
      const limit = values[values.length - 1];
      if (state.usage >= limit) return [];
      state.usage += 1;
      return [{ count: state.usage }];
    },
  };
  return { prisma, state };
};

const toResponse = (item) => ({
  ok: true,
  text: async () => JSON.stringify({ response: { header: { resultCode: '00' }, body: { item } } }),
});

let originalFetch;
let fetchCalls;
beforeEach(() => {
  originalFetch = globalThis.fetch;
  fetchCalls = 0;
  process.env.DATA_GO_KR_SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? 'test-key';
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('채우기: 실패 3회 미만·활성·미채움 단지만 kapt_code 순서로 고른다', async () => {
  globalThis.fetch = async () => toResponse(PARKRIO_ITEM);
  const { prisma, state } = createFakePrisma({ rowCount: 2 });
  const summary = await fillKaptBasis({ prisma, maxRows: 10, usageLimit: 100, minIntervalMs: 0, now: () => NOW });

  assert.deepEqual(state.findManyArgs.where, {
    basisFetchedAt: null,
    basisAttempts: { lt: MAX_BASIS_ATTEMPTS },
    isActive: true,
  });
  assert.deepEqual(state.findManyArgs.orderBy, { kaptCode: 'asc' });
  assert.equal(summary.filled, 2);
  assert.equal(summary.road.OK, 2);
  assert.equal(summary.stopReason, 'no more rows');
  // 도로명 키는 kapt_address_links(KAPT_API)로
  assert.deepEqual(state.links[0], ['11710', '올림픽로', false, 435, 0, 'A00000000']);
  assert.equal(summary.linkKeys.length, 2);
  assert.equal(state.updates[0].data.saleType, '분양');
});

test('채우기: 오늘 사용량이 상한에 닿으면 더 부르지 않는다', async () => {
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return toResponse(PARKRIO_ITEM);
  };
  const { prisma, state } = createFakePrisma({ rowCount: 10, usage: 4497 });
  const summary = await fillKaptBasis({ prisma, maxRows: 10, usageLimit: 4500, minIntervalMs: 0, now: () => NOW });

  assert.equal(fetchCalls, 3);
  assert.equal(state.usage, 4500);
  assert.equal(summary.stopReason, 'daily limit');
});

test('채우기: 마감 시각이 지나면 새 호출을 시작하지 않는다', async () => {
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return toResponse(PARKRIO_ITEM);
  };
  const { prisma } = createFakePrisma({ rowCount: 30 });
  const summary = await fillKaptBasis({ prisma, maxRows: 30, usageLimit: 4700, deadlineAt: Date.now() - 1 });

  assert.equal(fetchCalls, 0);
  assert.equal(summary.stopReason, 'deadline');
});

test('채우기: 실패하면 basis_attempts를 올리고 사유를 남긴다', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => '' });
  const { prisma, state } = createFakePrisma({ rowCount: 1 });
  const summary = await fillKaptBasis({ prisma, maxRows: 1, usageLimit: 100, minIntervalMs: 0 });

  assert.equal(summary.failed, 1);
  assert.deepEqual(state.updates[0].data, { basisAttempts: { increment: 1 }, basisError: 'kapt-basis HTTP 500' });
});

const throttledResponse = () => ({
  ok: true,
  text: async () => JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: '04' } } }),
});

test('채우기: 차단(429·게이트웨이 04)이면 쉬었다 같은 단지를 다시 부른다', async () => {
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return fetchCalls === 1 ? throttledResponse() : toResponse(PARKRIO_ITEM);
  };
  const { prisma } = createFakePrisma({ rowCount: 1 });
  const summary = await fillKaptBasis({ prisma, maxRows: 1, usageLimit: 100, minIntervalMs: 0, throttlePauseMs: 1 });

  assert.equal(fetchCalls, 2);
  assert.equal(summary.filled, 1);
  assert.equal(summary.throttlePauses, 1);
});

test('채우기: 쉬었다 불러도 계속 차단이면 실패 수를 올리지 않고 멈춘다(그 행은 다음 실행에)', async () => {
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return { ok: false, status: 429, text: async () => '' };
  };
  const { prisma, state } = createFakePrisma({ rowCount: 10 });
  const summary = await fillKaptBasis({ prisma, maxRows: 10, usageLimit: 100, minIntervalMs: 0, throttlePauseMs: 1 });

  assert.equal(fetchCalls, 4);
  assert.equal(summary.failed, 0);
  assert.equal(summary.processed, 0);
  assert.equal(state.updates.length, 0);
  assert.match(summary.stopReason, /^throttled/);
});

test('채우기: 쉬는 동안 마감이 지나면 실패로 남기지 않고 멈춘다', async () => {
  globalThis.fetch = async () => throttledResponse();
  const { prisma, state } = createFakePrisma({ rowCount: 3 });
  const summary = await fillKaptBasis({
    prisma,
    maxRows: 3,
    usageLimit: 100,
    minIntervalMs: 0,
    throttlePauseMs: 60000,
    deadlineAt: Date.now() + 1000,
  });

  assert.equal(summary.stopReason, 'deadline');
  assert.equal(state.updates.length, 0);
});

test('채우기: 하루 한도 초과 응답(게이트웨이 22)이면 멈춘다', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: '22' } } }),
  });
  const { prisma, state } = createFakePrisma({ rowCount: 5 });
  const summary = await fillKaptBasis({ prisma, maxRows: 5, usageLimit: 100, minIntervalMs: 0 });

  // basis_attempts를 올리지 않는다 — 한도 탓이라 그 단지는 다음 실행에 다시 부른다.
  assert.equal(state.updates.length, 0);
  assert.equal(summary.processed, 0);
  assert.equal(summary.failed, 0);
  assert.equal(summary.stopReason, 'quota: kapt-basis gateway 22');
});

test('채우기: 산 번지는 main_lot·sub_lot을 비우고 지번 원문은 남긴다', () => {
  const columns = toKaptBasisColumns({ ...PARKRIO_ITEM, kaptAddr: '경기도 가평군 가평읍 읍내리 산12-3 OO' }, NOW);
  assert.equal(columns.mainLot, null);
  assert.equal(columns.subLot, null);
  assert.equal(columns.jibunAddress, '경기도 가평군 가평읍 읍내리 산12-3 OO');
});
