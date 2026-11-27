// 시세 DB 테스트(RUN_DB_TESTS=1 · 로컬 DB). 외부 호출은 가짜(fetchImpl) — 실제 국토부 API 를 부르지 않는다.
// 수집 테스트는 시군구 11350(서울 노원구, 법정동 1135010600 중계동 — dbTest.createComplex 의 동)을 쓴다. 고정 응답(송파구 실제 행)의
// 시군구 · 법정동만 노원구 중계동으로 바꿔 넣는다. 끝나면 이 테스트가 만든 시군구의 market_* 행 · 작업 · 단지 · 사용자를 지운다.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import app from '../../../src/app.js';
import { signAccessToken } from '../../../src/domains/auth/service.js';
import { prisma } from '../../../src/platform/prismaClient.js';
import { formatCollectionLog } from '../../../src/domains/marketPrices/controller.js';
import { roadKeyOf } from '../../../src/domains/marketPrices/linkComplex.js';
import { retentionMonths } from '../../../src/domains/marketPrices/months.js';
import { BACKFILL_JOB_TYPE, REFRESH_MIN_AGE_MS, REQUEST_TIMEOUT_MS, RETRY_DELAY_MS } from '../../../src/domains/marketPrices/marketPriceRules.js';
import { normalizeItem, parseRtmsXml } from '../../../src/domains/marketPrices/rtmsProvider.js';
import { collectMarketPrices, loadLinkIndex, rebuildSigunguLinks, relinkSigungu } from '../../../src/domains/marketPrices/service/collect.js';
import { findComplexMarketPrices } from '../../../src/domains/marketPrices/service/prices.js';
import { JUNGGYE_GREEN_LINES, JUNGGYE_GREEN_XML } from './fixtures/junggyeGreenTrades.js';
import { EMPTY_XML, KEY_ERROR_XML, RENT_ITEMS, TRADE_ITEMS, wrapResponse } from './fixtures/rtmsResponses.js';

const SGG = '11350';
const DONG = '1135010600';
const HOUR = 60 * 60 * 1000;
// 고정 응답 행을 노원구 중계동으로
const toNowon = (itemXml) =>
  itemXml.replaceAll('11710', SGG).replace(/<umdCd>\d+<\/umdCd>/, '<umdCd>10600</umdCd>').replace(/<umdNm>[^<]*<\/umdNm>/, '<umdNm>중계동</umdNm>');
const tradeItems = TRADE_ITEMS.map(toNowon);
// 헬리오시티 전세의 다른 동(도로명 번호만 다름) — 매매 헬리오시티(도로명으로 이어짐)의 aptSeq 로 이어지는지
const otherBuilding = toNowon(RENT_ITEMS[1]).replace('<roadnmbonbun>00345</roadnmbonbun>', '<roadnmbonbun>00347</roadnmbonbun>');
const rentItems = [...RENT_ITEMS.map(toNowon), otherBuilding];
const deal = (kind, xml) => normalizeItem(kind, parseRtmsXml(wrapResponse([xml])).items[0]);
const [TRIZIUM, JUGONG5, HELIO] = tradeItems.map((xml) => deal('TRADE', xml));
const HYUNDAI1 = deal('RENT', rentItems[2]); // 지번 "413-1"
const HANGANG = deal('RENT', rentItems[0]); // 한강극동 — 처음엔 우리 단지 아님

// 가짜 fetch: 계약월 · 종류별 응답. 기본은 2026-10 에 고정 응답, 나머지 달은 0건
const fakeFetch = ({ trade = wrapResponse(tradeItems), rent = wrapResponse(rentItems), month = '202610' } = {}) => {
  const calls = [];
  const fetchImpl = async (url) => {
    const params = new URL(url).searchParams;
    const kind = url.includes('RTMSDataSvcAptTradeDev') ? 'TRADE' : 'RENT';
    calls.push(`${kind} ${params.get('LAWD_CD')} ${params.get('DEAL_YMD')}`);
    const xml = params.get('DEAL_YMD') === month ? (kind === 'TRADE' ? trade : rent) : EMPTY_XML;
    return { ok: true, status: 200, headers: new Headers(), text: async () => xml };
  };
  return { fetchImpl, calls };
};

describe('시세(실거래가)', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const userIds = [];
  const sigungus = new Set([SGG]);
  let server;
  let origin;
  let landlord;
  let tenant;
  let complexes;
  // 수집 기준 시각 — 2026-10 이 최근 3개월 안(다시 모으기 대상)이도록 고정
  const NOW = Date.parse('2026-11-17T03:00:00Z');

  const api = (user, pathname) =>
    fetch(`${origin}${pathname}`, { headers: { ...(user ? { Cookie: `access_token=${signAccessToken(user)}` } : {}), 'X-Requested-With': 'butler-web' } });
  const clearSigungu = async (code) => {
    await prisma.marketDeal.deleteMany({ where: { sigunguCode: code } });
    await prisma.marketCollection.deleteMany({ where: { sigunguCode: code } });
  };
  const dealsIn = (where = {}) => prisma.marketDeal.findMany({ where: { sigunguCode: SGG, ...where } });

  before(async () => {
    server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    origin = `http://127.0.0.1:${server.address().port}`;
    landlord = await fixture.createUser('LANDLORD');
    tenant = await fixture.createUser('TENANT');
    userIds.push(landlord.id, tenant.id);
    await clearSigungu(SGG);
    complexes = {
      road: await fixture.createComplex({ name: '시세 테스트 트리지움', sourceKey: roadKeyOf(TRIZIUM.road) }),
      helio: await fixture.createComplex({ name: '시세 테스트 헬리오', sourceKey: roadKeyOf(HELIO.road) }),
      lot: await fixture.createComplex({ name: '시세 테스트 주공5', mainLot: Number(JUGONG5.mainLotText), subLot: Number(JUGONG5.subLotText), isMountain: false }),
      rentLot: await fixture.createComplex({ name: '시세 테스트 현대1', mainLot: 413, subLot: 1, isMountain: false }),
    };
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    for (const code of sigungus) await clearSigungu(code);
    await prisma.job.deleteMany({ where: { requestedById: { in: userIds } } });
    for (const id of userIds) await prisma.rateLimit.deleteMany({ where: { id: { contains: id } } });
    await fixture.cleanup();
  });

  test('수집: 13개월 × 매매 · 전월세 26 묶음, 해제 빼고 저장, 도로명 · 지번 · aptSeq 로 잇기', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const summary = await collectMarketPrices({ sigunguCodes: [SGG], fetchImpl, now: () => NOW });
    assert.equal(summary.planned, 26);
    assert.equal(summary.done, 26);
    assert.equal(summary.failed, 0);
    assert.equal(summary.calls, 26);
    assert.equal(calls.length, 26);
    assert.equal(summary.cancelled, 1); // 송파센텀레이크(해제)
    assert.equal(summary.saved, 3 + 7);

    const collections = await prisma.marketCollection.findMany({ where: { sigunguCode: SGG } });
    assert.equal(collections.length, 26);
    assert.ok(collections.every((row) => row.status === 'SUCCEEDED' && row.collectedAt));

    const deals = await dealsIn();
    assert.equal(deals.length, 10);
    assert.ok(!deals.some((row) => row.aptName === '송파센텀레이크'));
    assert.ok(deals.every((row) => row.legalDongCode === DONG && row.contractYearMonth === '2026-10'));
    const count = (type) => deals.filter((row) => row.dealType === type).length;
    assert.deepEqual([count('SALE'), count('JEONSE'), count('MONTHLY')], [3, 5, 2]);
    const byName = (name, type) => deals.find((row) => row.aptName === name && (!type || row.dealType === type));
    assert.equal(byName('트리지움').price, 3030000000n);
    assert.deepEqual([byName('트리지움').complexId, byName('트리지움').linkMethod], [complexes.road.id, 'ROAD']);
    assert.deepEqual([byName('주공아파트 5단지').complexId, byName('주공아파트 5단지').linkMethod], [complexes.lot.id, 'JIBUN']);
    assert.deepEqual([byName('현대1').complexId, byName('현대1').linkMethod], [complexes.rentLot.id, 'JIBUN']);
    const helioRents = deals.filter((row) => row.aptName === '헬리오시티' && row.dealType === 'JEONSE');
    assert.deepEqual(helioRents.map((row) => row.linkMethod).sort(), ['APT_SEQ', 'ROAD']); // 같은 동 · 다른 동(도로명 번호 다름)
    assert.ok(helioRents.every((row) => row.complexId === complexes.helio.id));
    assert.equal(byName('한강극동').complexId, null); // 우리 단지 아님 — 동 시세에만
    assert.equal(byName('한강극동').roadKey, roadKeyOf(HANGANG.road)); // 나중에 이을 키는 남긴다
    const monthly = deals.filter((row) => row.dealType === 'MONTHLY');
    assert.ok(monthly.every((row) => row.monthlyRent > 0n && row.deposit > 0n && row.price === null));
  });

  test('다시 모으기: 최근 3개월만, 묶음을 지우고 새로 넣어 뒤늦게 해제된 거래가 빠진다', async () => {
    const before = await dealsIn({ dealKind: 'TRADE' });
    const { fetchImpl, calls } = fakeFetch({ trade: wrapResponse([tradeItems[0], tradeItems[2]]) }); // 주공5단지가 나중에 해제됨
    const summary = await collectMarketPrices({ sigunguCodes: [SGG], fetchImpl, now: () => NOW + REFRESH_MIN_AGE_MS });
    assert.equal(summary.planned, 6);
    assert.deepEqual([...new Set(calls.map((call) => call.split(' ')[2]))].sort(), ['202609', '202610', '202611']);
    const after = await dealsIn({ dealKind: 'TRADE' });
    assert.equal(before.length, 3);
    assert.deepEqual(after.map((row) => row.aptName).sort(), ['트리지움', '헬리오시티']);
    assert.equal((await dealsIn({ dealKind: 'RENT' })).length, 7); // 전월세 묶음은 그대로 다시 들어옴
  });

  test('실패한 묶음은 지우지 않고 FAILED · 결과 코드만 남긴다', async () => {
    const { fetchImpl } = fakeFetch({ trade: KEY_ERROR_XML });
    const summary = await collectMarketPrices({ sigunguCodes: [SGG], fetchImpl, now: () => NOW + 2 * REFRESH_MIN_AGE_MS });
    assert.equal(summary.failed, 1);
    assert.match(summary.failures[0], /2026-10 TRADE 30$/);
    const row = await prisma.marketCollection.findUnique({ where: { sigunguCode_yearMonth_dealKind: { sigunguCode: SGG, yearMonth: '2026-10', dealKind: 'TRADE' } } });
    assert.equal(row.status, 'FAILED');
    assert.equal(row.lastErrorCode, '30');
    assert.ok(row.collectedAt); // 마지막 성공 시각은 그대로 — 화면은 계속 READY
    assert.equal((await dealsIn({ dealKind: 'TRADE' })).length, 2);
  });

  test('응답 모양은 규격 2장 시세와 같다(단지 · READY) — 금액은 원 숫자, 거래 있는 달만', async () => {
    const res = await api(landlord, `/api/v1/market-prices/complexes/${complexes.helio.id}?dealType=JEONSE&fromYearMonth=2025-12&toYearMonth=2026-11`);
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.deepEqual(Object.keys(data).sort(), ['areaMax', 'areaMin', 'asOf', 'collectionStatus', 'complexId', 'coveredFromYearMonth', 'dealType', 'jobId', 'legalDongCode', 'monthly', 'recentDeals', 'scope', 'source'].sort());
    assert.equal(data.scope, 'COMPLEX');
    assert.equal(data.complexId, complexes.helio.id);
    assert.equal(data.legalDongCode, DONG);
    assert.equal(data.collectionStatus, 'READY');
    assert.equal(data.jobId, null);
    assert.equal(data.source, '국토교통부 실거래가');
    assert.match(data.asOf, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(data.coveredFromYearMonth, '2025-11');
    assert.deepEqual([data.areaMin, data.areaMax], [null, null]);
    assert.equal(data.monthly.length, 1); // 거래 있는 달(2026-10)만
    assert.deepEqual(Object.keys(data.monthly[0]).sort(), ['avgDeposit', 'avgMonthlyRent', 'avgPrice', 'dealCount', 'maxPrice', 'minPrice', 'yearMonth'].sort());
    assert.deepEqual(data.monthly[0], { yearMonth: '2026-10', dealCount: 2, avgPrice: null, minPrice: null, maxPrice: null, avgDeposit: 500000000, avgMonthlyRent: null });
    assert.equal(data.recentDeals.length, 2);
    assert.deepEqual(Object.keys(data.recentDeals[0]).sort(), ['complexName', 'contractDate', 'deposit', 'dealType', 'exclusiveArea', 'floor', 'monthlyRent', 'price'].sort());
    assert.ok(data.recentDeals.every((row) => row.complexName === '시세 테스트 헬리오' && typeof row.deposit === 'number' && row.price === null));
  });

  test('동 시세: 그 법정동 거래 전부(이어진 · 못 이은 것), 못 이은 거래의 단지 이름은 원천 이름', async () => {
    const res = await api(tenant, `/api/v1/market-prices/regions/${DONG}?dealType=JEONSE&fromYearMonth=2025-12&toYearMonth=2026-11`);
    const { data } = await res.json();
    assert.equal(data.scope, 'REGION');
    assert.equal(data.complexId, null);
    assert.equal(data.monthly[0].dealCount, 5);
    const names = data.recentDeals.map((row) => row.complexName);
    assert.ok(names.includes('한강극동') && names.includes('시세 테스트 현대1'));
  });

  test('일부 모음(COLLECTING): 모은 달의 데이터 — monthly 는 요청 기간의 모든 달 + collected(못 모은 달은 null), 거래는 모은 달의 것만, asOf 는 모은 달 기준 (#267 2차)', async () => {
    // 전월세 2026-10 에는 거래가 5건 있다(앞 테스트). 모은 기록만 잠깐 바꿨다가 그대로 되돌린다
    const saved = await prisma.marketCollection.findMany({ where: { sigunguCode: SGG, dealKind: 'RENT' } });
    const uncollect = (yearMonth) =>
      prisma.marketCollection.update({
        where: { sigunguCode_yearMonth_dealKind: { sigunguCode: SGG, yearMonth, dealKind: 'RENT' } },
        data: { collectedAt: null, status: 'FAILED', lastErrorCode: 'TIMEOUT' },
      });
    const restore = async () => {
      for (const row of saved) await prisma.marketCollection.update({ where: { id: row.id }, data: { collectedAt: row.collectedAt, status: row.status, attemptedAt: row.attemptedAt, lastErrorCode: row.lastErrorCode } });
    };
    const regionJeonse = async () => (await (await api(tenant, `/api/v1/market-prices/regions/${DONG}?dealType=JEONSE&fromYearMonth=2025-12&toYearMonth=2026-11`)).json()).data;
    const expectedAsOf = (excluded) => {
      const latest = saved.filter((row) => row.yearMonth !== excluded && row.collectedAt).reduce((max, row) => (row.collectedAt > max ? row.collectedAt : max), new Date(0));
      return new Date(latest.getTime() + 9 * HOUR).toISOString().slice(0, 10);
    };
    try {
      // ① 거래가 있는 달(2026-10)을 못 모음 → 그 달은 collected false · null, 그 달 거래는 저장돼 있어도 내보내지 않는다
      await uncollect('2026-10');
      const missingDealMonth = await regionJeonse();
      assert.equal(missingDealMonth.collectionStatus, 'COLLECTING');
      assert.deepEqual(Object.keys(missingDealMonth).sort(), ['areaMax', 'areaMin', 'asOf', 'collectionProgress', 'collectionStatus', 'complexId', 'coveredFromYearMonth', 'dealType', 'jobId', 'legalDongCode', 'monthly', 'recentDeals', 'scope', 'source'].sort());
      assert.equal(missingDealMonth.monthly.length, 12); // 요청 기간 2025-12 ~ 2026-11 의 모든 달
      assert.deepEqual(missingDealMonth.monthly.map((row) => row.yearMonth), retentionMonths(new Date()).slice(1));
      const october = missingDealMonth.monthly.find((row) => row.yearMonth === '2026-10');
      assert.deepEqual(october, { yearMonth: '2026-10', dealCount: null, avgPrice: null, minPrice: null, maxPrice: null, avgDeposit: null, avgMonthlyRent: null, collected: false });
      assert.ok(missingDealMonth.monthly.filter((row) => row.yearMonth !== '2026-10').every((row) => row.collected === true && row.dealCount === 0));
      assert.deepEqual(missingDealMonth.recentDeals, []);
      assert.equal(missingDealMonth.asOf, expectedAsOf('2026-10'));
      assert.equal(missingDealMonth.coveredFromYearMonth, null);
      assert.deepEqual([missingDealMonth.collectionProgress.collectedMonths, missingDealMonth.collectionProgress.failedMonths], [12, 1]);

      // ② 거래 없는 달(2026-09)을 못 모음 → 2026-10 의 거래 · 평균은 그대로 보인다
      await restore();
      await uncollect('2026-09');
      const missingQuietMonth = await regionJeonse();
      assert.equal(missingQuietMonth.collectionStatus, 'COLLECTING');
      const byMonth = new Map(missingQuietMonth.monthly.map((row) => [row.yearMonth, row]));
      assert.deepEqual([byMonth.get('2026-09').collected, byMonth.get('2026-09').dealCount], [false, null]);
      assert.deepEqual([byMonth.get('2026-10').collected, byMonth.get('2026-10').dealCount, typeof byMonth.get('2026-10').avgDeposit], [true, 5, 'number']);
      assert.deepEqual([byMonth.get('2026-08').collected, byMonth.get('2026-08').dealCount], [true, 0]);
      assert.equal(missingQuietMonth.recentDeals.length, 5);
      assert.ok(missingQuietMonth.recentDeals.every((deal) => deal.contractDate.startsWith('2026-10')));
    } finally {
      await restore();
    }
    // 되돌리면 READY 그대로(collected 칸 없음, 거래 있는 달만)
    const ready = await regionJeonse();
    assert.equal(ready.collectionStatus, 'READY');
    assert.deepEqual(ready.monthly.map((row) => [row.yearMonth, row.dealCount, 'collected' in row]), [['2026-10', 5, false]]);
  });

  test('면적 경계: areaMin < 전용면적 ≤ areaMax — 정확히 60 · 85 · 105㎡ 거래는 한 칩에만', async () => {
    const boundary = [60, 85, 105].map((exclusiveArea) => ({
      dealKind: 'TRADE', dealType: 'SALE', sigunguCode: SGG, contractYearMonth: '2026-10', legalDongCode: DONG, aptName: `경계 ${exclusiveArea}`,
      exclusiveArea, floor: 1, contractDate: new Date('2026-10-15T00:00:00Z'), price: 100000000n, collectedAt: new Date(),
    }));
    await prisma.marketDeal.createMany({ data: boundary });
    try {
      const bands = [['', '60'], ['60', '85'], ['85', '105'], ['105', '']];
      const seen = [];
      for (const [areaMin, areaMax] of bands) {
        const query = new URLSearchParams({ dealType: 'SALE', fromYearMonth: '2025-12', toYearMonth: '2026-11', ...(areaMin ? { areaMin } : {}), ...(areaMax ? { areaMax } : {}) });
        const { data } = await (await api(tenant, `/api/v1/market-prices/regions/${DONG}?${query}`)).json();
        assert.deepEqual([data.areaMin, data.areaMax], [areaMin ? Number(areaMin) : null, areaMax ? Number(areaMax) : null]);
        seen.push(data.recentDeals.filter((row) => row.complexName.startsWith('경계')).map((row) => row.exclusiveArea).sort((a, b) => a - b));
      }
      assert.deepEqual(seen, [[60], [85], [105], []]);
    } finally {
      await prisma.marketDeal.deleteMany({ where: { sigunguCode: SGG, aptName: { startsWith: '경계 ' } } });
    }
  });

  test('권한 · 에러: 로그인 필요, 없는 단지 · 법정동 404, dealType 없으면 400', async () => {
    assert.equal((await api(null, `/api/v1/market-prices/complexes/${complexes.road.id}?dealType=SALE`)).status, 401);
    const notFound = await api(landlord, '/api/v1/market-prices/complexes/00000000-0000-4000-8000-00000000abcd?dealType=SALE');
    assert.equal(notFound.status, 404);
    assert.equal((await notFound.json()).error.code, 'COMPLEX_NOT_FOUND');
    assert.equal((await (await api(landlord, '/api/v1/market-prices/complexes/abc?dealType=SALE')).json()).error.code, 'COMPLEX_NOT_FOUND');
    for (const code of ['0000000000', 'abc']) {
      const res = await api(landlord, `/api/v1/market-prices/regions/${code}?dealType=SALE`);
      assert.equal(res.status, 404);
      assert.equal((await res.json()).error.code, 'REGION_NOT_FOUND');
    }
    const bad = await api(landlord, `/api/v1/market-prices/complexes/${complexes.road.id}`);
    assert.equal(bad.status, 400);
    const body = await bad.json();
    assert.equal(body.error.code, 'MARKET_PRICE_INVALID_QUERY');
    assert.equal(body.error.details[0].field, 'dealType');
  });

  test('처음 보는 시군구: COLLECTING + 요청한 사람 이름의 작업(같은 사람 재사용), 정기 실행이 채우면 작업 끝 · READY', async () => {
    const collected = new Set((await prisma.marketCollection.findMany({ distinct: ['sigunguCode'], select: { sigunguCode: true } })).map((row) => row.sigunguCode));
    const regions = await prisma.region.findMany({ where: { id: { startsWith: '5' } }, select: { id: true }, take: 200 });
    const region = regions.find((row) => !collected.has(row.id.slice(0, 5)));
    const sgg = region.id.slice(0, 5);
    sigungus.add(sgg);
    const complex = await fixture.createComplex({ name: '시세 테스트 처음 보는 단지', regionId: region.id });
    const path = `/api/v1/market-prices/complexes/${complex.id}?dealType=SALE`;

    const first = (await (await api(landlord, path)).json()).data;
    assert.equal(first.collectionStatus, 'COLLECTING');
    assert.deepEqual([first.monthly, first.recentDeals, first.asOf, first.coveredFromYearMonth], [[], [], null, null]);
    assert.ok(first.jobId);
    const job = await prisma.job.findUnique({ where: { id: first.jobId } });
    assert.deepEqual([job.type, job.status, job.requestedById, job.payload], [BACKFILL_JOB_TYPE, 'PENDING', landlord.id, { sigunguCode: sgg }]);
    assert.equal((await (await api(landlord, path)).json()).data.jobId, first.jobId); // 같은 사람 → 같은 작업
    const otherJobId = (await (await api(tenant, path)).json()).data.jobId;
    assert.notEqual(otherJobId, first.jobId); // 다른 사람 → 그 사람 작업(GET /jobs 는 본인만 보므로)
    assert.equal((await api(landlord, `/api/v1/jobs/${first.jobId}`)).status, 200);
    assert.equal((await api(tenant, `/api/v1/jobs/${first.jobId}`)).status, 404);

    const { fetchImpl } = fakeFetch({ month: 'none' });
    const summary = await collectMarketPrices({ sigunguCodes: [sgg], fetchImpl, now: () => Date.now() + 1000 });
    assert.equal(summary.done, 26);
    assert.ok(summary.jobsCompleted >= 2);
    assert.equal((await prisma.job.findUnique({ where: { id: first.jobId } })).status, 'SUCCEEDED');
    const ready = (await (await api(landlord, path)).json()).data;
    assert.equal(ready.collectionStatus, 'READY');
    assert.deepEqual([ready.monthly, ready.recentDeals], [[], []]); // 거래 없는 달은 monthly 에 넣지 않는다
  });

  test('나중에 등록된 단지: 원천을 다시 부르지 않고 저장된 거래를 잇는다(정기 실행 · 첫 조회 때 — DB 만)', async () => {
    // 앞 테스트들의 마지막 수집(가짜 시계 NOW + 40시간) 뒤에 등록된 단지 — 같은 가짜 시계로 등록 시각을 맞춘다
    const late = await fixture.createComplex({ name: '시세 테스트 한강극동', sourceKey: roadKeyOf(HANGANG.road), createdAt: new Date(NOW + 2.5 * REFRESH_MIN_AGE_MS) });
    assert.equal((await dealsIn({ aptName: '한강극동' }))[0].complexId, null);
    // 정기 실행의 잇기 단계(DB 만) — 2026-10 은 이미 저장돼 있고 다시 받지 않아도 이어진다
    assert.equal(await relinkSigungu(SGG, await loadLinkIndex(SGG)), 1);
    const row = (await dealsIn({ aptName: '한강극동' }))[0];
    assert.deepEqual([row.complexId, row.linkMethod], [late.id, 'ROAD']);
    // 정기 실행 전에 조회해도: 마지막 수집 뒤 등록된 단지는 조회 때 잇고 바로 READY(COLLECTING 아님 — 시군구는 이미 모아져 있다)
    await prisma.marketDeal.updateMany({ where: { id: row.id }, data: { complexId: null, linkMethod: null } });
    const query = { dealType: 'JEONSE', fromYearMonth: '2025-12', toYearMonth: '2026-11' };
    const prices = await findComplexMarketPrices(landlord, late.id, query, { now: new Date() });
    assert.equal(prices.collectionStatus, 'READY');
    assert.deepEqual(prices.recentDeals.map((deal) => deal.complexName), ['시세 테스트 한강극동']);
  });

  test('같은 도로명주소의 다른 단지: 저장된 거래를 다시 이으면(원천 호출 없이) 지번이 다른 거래는 풀린다', async () => {
    const road = 'ROAD:113509999999-0-435-0';
    const xi1 = await fixture.createComplex({ name: '시세 테스트 자이1', sourceKey: road, mainLot: 1527, subLot: 0, isMountain: false });
    // 옛 규칙(도로명만)으로 이어 둔 모양 — 1단지 지번 · 2단지 지번 거래가 모두 1단지에 이어져 있다
    const base = { dealKind: 'TRADE', dealType: 'SALE', sigunguCode: SGG, contractYearMonth: '2026-10', legalDongCode: DONG, roadKey: road, exclusiveArea: 84.5, contractDate: new Date('2026-10-20T00:00:00Z'), price: 900000000n, collectedAt: new Date(), complexId: xi1.id, linkMethod: 'ROAD' };
    await prisma.marketDeal.createMany({
      data: [
        { ...base, aptName: '자이1단지', aptSeq: '11350-1', lotKey: `${DONG}|0|1527|0` },
        { ...base, aptName: '자이2단지', aptSeq: '11350-2', lotKey: `${DONG}|0|1529|0` },
      ],
    });
    const before = await dealsIn({ complexId: { not: null } });
    const result = await rebuildSigunguLinks(SGG);
    assert.equal(result.unlinked, before.length);
    assert.equal(result.relinked, before.length - 1); // 2단지 한 건만 빠진다
    const rows = await dealsIn({ aptName: { in: ['자이1단지', '자이2단지'] } });
    const byName = Object.fromEntries(rows.map((row) => [row.aptName, [row.complexId, row.linkMethod]]));
    assert.deepEqual(byName, { 자이1단지: [xi1.id, 'ROAD'], 자이2단지: [null, null] });
    // 다른 거래의 잇기는 그대로(도로명 · 지번 · aptSeq)
    const after = await dealsIn({ complexId: { not: null } });
    const key = (row) => `${row.id}|${row.complexId}|${row.linkMethod}`;
    assert.deepEqual(after.map(key).sort(), before.filter((row) => row.aptName !== '자이2단지').map(key).sort());
  });

  test('시간 한도: 남은 시간이 요청 하나 몫보다 적으면 새 묶음을 시작하지 않고, 남은 것은 다음 실행에 앞에서부터', async () => {
    const sgg = '11350';
    await clearSigungu(sgg);
    let clock = NOW;
    const now = () => {
      clock += 500;
      return clock;
    };
    const { fetchImpl } = fakeFetch({ month: 'none' });
    const first = await collectMarketPrices({ sigunguCodes: [sgg], fetchImpl, now, budgetMs: REQUEST_TIMEOUT_MS + 3000 });
    assert.ok(first.done >= 1 && first.skipped >= 1, JSON.stringify(first));
    assert.equal(first.done + first.skipped, 26);
    const firstDone = await prisma.marketCollection.findMany({ where: { sigunguCode: sgg }, select: { yearMonth: true, dealKind: true } });
    assert.ok(firstDone.some((row) => row.yearMonth === '2026-11' && row.dealKind === 'TRADE')); // 최근 달 · 매매부터
    const second = await collectMarketPrices({ sigunguCodes: [sgg], fetchImpl, now: () => NOW + HOUR });
    assert.equal(second.planned, first.skipped);
    assert.equal(second.done, first.skipped);
  });

  test('동시 요청은 1개 — 앞 요청이 끝나야 다음 요청(매매 · 전월세 모두)', async () => {
    await clearSigungu(SGG);
    const { fetchImpl: base } = fakeFetch();
    let inFlight = 0;
    let maxInFlight = 0;
    const kinds = new Set();
    const fetchImpl = async (url, init) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      kinds.add(url.includes('RTMSDataSvcAptTradeDev') ? 'TRADE' : 'RENT');
      await new Promise((resolve) => setTimeout(resolve, 5)); // 겹친다면 이 사이에 다음 요청이 들어온다
      inFlight -= 1;
      return base(url, init);
    };
    const summary = await collectMarketPrices({ sigunguCodes: [SGG], fetchImpl, now: () => NOW });
    assert.equal(summary.done, 26);
    assert.equal(summary.calls, 26);
    assert.equal(maxInFlight, 1);
    assert.deepEqual([...kinds].sort(), ['RENT', 'TRADE']);
  });

  test('다시 시도해도 시간 초과면 그 묶음만 FAILED(TIMEOUT) — 예전 데이터는 지우지 않고, 부른 횟수에 다시 시도가 들어간다', async () => {
    const before = await dealsIn({ dealKind: 'TRADE', contractYearMonth: '2026-10' });
    const { fetchImpl: base } = fakeFetch();
    const fetchImpl = async (url, init) => {
      const params = new URL(url).searchParams;
      if (url.includes('RTMSDataSvcAptTradeDev') && params.get('DEAL_YMD') === '202610') throw new DOMException('timeout', 'TimeoutError');
      return base(url, init);
    };
    const slept = [];
    const summary = await collectMarketPrices({ sigunguCodes: [SGG], fetchImpl, now: () => NOW + REFRESH_MIN_AGE_MS, sleep: async (ms) => slept.push(ms) });
    assert.equal(summary.planned, 6); // 최근 3개월 × 2
    assert.equal(summary.done, 5);
    assert.equal(summary.failed, 1);
    assert.match(summary.failures[0], /2026-10 TRADE TIMEOUT$/);
    assert.equal(summary.calls, 7); // 5 + 실패한 묶음 2번
    assert.equal(slept.length, 1);
    const row = await prisma.marketCollection.findUnique({ where: { sigunguCode_yearMonth_dealKind: { sigunguCode: SGG, yearMonth: '2026-10', dealKind: 'TRADE' } } });
    assert.equal(row.status, 'FAILED');
    assert.equal(row.lastErrorCode, 'TIMEOUT');
    assert.ok(row.collectedAt);
    const after = await dealsIn({ dealKind: 'TRADE', contractYearMonth: '2026-10' });
    assert.equal(before.length, 3);
    assert.deepEqual(after.map((r) => r.id).sort(), before.map((r) => r.id).sort()); // 같은 행 그대로
  });

  test('수집 순서: 대기 작업 구의 채우기가 먼저 — 그 구가 시간 초과로 계속 실패해도 시간 한도의 절반이 지나면 다른 구 채우기가 같은 실행 안에서 시작된다 (#267)', async () => {
    // 실제 단지 · 법정동이 없는 시군구 둘(이 테스트만 쓴다). 대기 작업이 없으면 시군구 순이라 OTHER 가 먼저다
    const OTHER = '99001';
    const WAITING = '99002';
    for (const code of [OTHER, WAITING]) {
      sigungus.add(code);
      await clearSigungu(code);
    }
    const pendingOther = await prisma.job.count({ where: { type: BACKFILL_JOB_TYPE, status: 'PENDING', payload: { path: ['sigunguCode'], equals: OTHER } } });
    assert.equal(pendingOther, 0);
    // 사용자가 WAITING 의 시세 화면을 열었다(COLLECTING → 대기 작업)
    await prisma.job.create({ data: { type: BACKFILL_JOB_TYPE, status: 'PENDING', payload: { sigunguCode: WAITING }, requestedById: landlord.id } });
    const originalKey = process.env.DATA_GO_KR_SERVICE_KEY;
    process.env.DATA_GO_KR_SERVICE_KEY = 'TEST-ONLY-fake-key'; // 가짜 fetch 만 부른다
    // 시계는 가짜: WAITING 은 부를 때마다 8초 걸려 시간 초과, OTHER 는 0.3초에 0건 정상. 다시 시도 전 쉬기도 시계만 민다
    let clock = NOW;
    const calls = [];
    const fetchImpl = async (url) => {
      const code = new URL(url).searchParams.get('LAWD_CD');
      calls.push({ code, at: clock - NOW });
      if (code === WAITING) {
        clock += REQUEST_TIMEOUT_MS;
        throw new DOMException('timeout', 'TimeoutError');
      }
      clock += 300;
      return { ok: true, status: 200, headers: new Headers(), text: async () => EMPTY_XML };
    };
    try {
      const summary = await collectMarketPrices({ sigunguCodes: [OTHER, WAITING], fetchImpl, now: () => clock, sleep: async (ms) => { clock += ms; } });
      // 절반(22.5초) 전에 시작한 묶음은 모두 WAITING — 0초 · 17.5초(8 + 1.5 + 8)에 둘, 둘 다 다시 시도까지 시간 초과
      const firstOther = calls.findIndex((call) => call.code === OTHER);
      assert.ok(firstOther > 0, JSON.stringify(calls));
      assert.ok(calls.slice(0, firstOther).every((call) => call.code === WAITING));
      assert.equal(firstOther, 4);
      // 35초에 남은 묶음이 지금 순서로 섞여 OTHER 채우기가 같은 실행 안에서 시작된다(안전장치가 없으면 35초에도 WAITING — OTHER 는 0)
      assert.equal(calls[firstOther].at, 2 * (REQUEST_TIMEOUT_MS + RETRY_DELAY_MS + REQUEST_TIMEOUT_MS));
      assert.equal(summary.failed, 2);
      assert.ok(summary.failures.every((line) => line.startsWith(`${WAITING} `) && line.endsWith(' TIMEOUT')), summary.failures.join(' / '));
      assert.ok(summary.done >= 1, JSON.stringify(summary));
      const otherDone = await prisma.marketCollection.count({ where: { sigunguCode: OTHER, status: 'SUCCEEDED' } });
      assert.equal(otherDone, summary.done);
      // 대기 작업은 그대로(WAITING 을 다 채우지 못했다)
      assert.equal(summary.jobsCompleted, 0);
    } finally {
      if (originalKey === undefined) delete process.env.DATA_GO_KR_SERVICE_KEY;
      else process.env.DATA_GO_KR_SERVICE_KEY = originalKey;
    }
  });

  test('다시 잇기(정기 실행 끝): 도로명 키가 건물 번호까지 같고 이름이 맞으면 지번이 달라도 잇고, 배운 일련번호로 나머지 도로명 거래도 잇는다 — 중계그린 (#270)', async () => {
    // 저장된 거래(못 이음) = 국토부 실제 8건 중 해제 1건을 뺀 7건. 우리 단지 = 주소 검색의 17 번지 줄(503)
    const green = parseRtmsXml(JUNGGYE_GREEN_XML).items.map((item) => normalizeItem('TRADE', item)).filter((item) => !item.cancelled);
    const rows = green.map((item) => ({
      dealKind: 'TRADE', dealType: 'SALE', sigunguCode: SGG, contractYearMonth: item.contractDate.slice(0, 7), legalDongCode: DONG,
      roadKey: roadKeyOf(item.road), lotKey: `${DONG}|0|502|1`, aptSeq: item.aptSeq, aptName: item.aptName, jibun: item.jibun,
      exclusiveArea: item.exclusiveArea, contractDate: new Date(`${item.contractDate}T00:00:00Z`), price: BigInt(item.price), collectedAt: new Date(),
    }));
    await prisma.marketDeal.createMany({ data: rows });
    try {
      const complex = await fixture.createComplex({ name: '중계그린아파트', buildingName: '중계그린아파트', isMountain: false, ...JUNGGYE_GREEN_LINES.road17 });
      const relinked = await relinkSigungu(SGG, await loadLinkIndex(SGG));
      assert.ok(relinked >= 7, String(relinked));
      const linked = await prisma.marketDeal.findMany({ where: { sigunguCode: SGG, aptSeq: '11350-120' }, select: { roadKey: true, complexId: true, linkMethod: true } });
      assert.equal(linked.length, 7);
      assert.ok(linked.every((row) => row.complexId === complex.id), JSON.stringify(linked));
      // 동일로207길 17 거래(2건)는 이름 확인으로 도로명, 18 · 섬밭로 285(5건)는 일련번호로
      const byMethod = (method) => linked.filter((row) => row.linkMethod === method).map((row) => row.roadKey).sort();
      assert.deepEqual(byMethod('ROAD'), [JUNGGYE_GREEN_LINES.road17.sourceKey, JUNGGYE_GREEN_LINES.road17.sourceKey]);
      assert.equal(byMethod('APT_SEQ').length, 5);
      // 단지 시세에도 나온다(모은 달인지와 상관없이 잇기만 본다 — complexId 로 고른 행 수)
      assert.equal(await prisma.marketDeal.count({ where: { complexId: complex.id } }), 7);
    } finally {
      await prisma.marketDeal.deleteMany({ where: { sigunguCode: SGG, aptSeq: '11350-120' } });
    }
  });

  describe('COLLECTING 의 모으기 진행(collectionProgress) — 시군구 · 종류마다, 보관 기간의 달 기준', () => {
    // 가짜 키 — 요청 주소에만 들어가고 응답 · 요약 · 로그에는 없어야 한다. 끝나면 원래 값(.env)으로 되돌린다
    const FAKE_KEY = 'TEST-ONLY+fake/key==';
    const originalKey = process.env.DATA_GO_KR_SERVICE_KEY;
    after(() => {
      if (originalKey === undefined) delete process.env.DATA_GO_KR_SERVICE_KEY;
      else process.env.DATA_GO_KR_SERVICE_KEY = originalKey;
    });
    const LEAK_WORDS = ['serviceKey', 'apis.data.go.kr', 'http', 'RTMSDataSvc', FAKE_KEY, encodeURIComponent(FAKE_KEY)];
    const assertNoLeak = (text, label) => {
      for (const word of LEAK_WORDS) assert.ok(!text.includes(word), `${label}: ${word}`);
    };
    // 아직 아무도 모으지 않은 시군구의 법정동 하나(다른 테스트 · 로컬 수집과 겹치지 않게)
    const pickFreshDong = async () => {
      const collected = new Set((await prisma.marketCollection.findMany({ distinct: ['sigunguCode'], select: { sigunguCode: true } })).map((row) => row.sigunguCode));
      const regions = await prisma.region.findMany({ where: { id: { startsWith: '4' } }, select: { id: true }, orderBy: { id: 'asc' }, take: 1000 });
      const region = regions.find((row) => !collected.has(row.id.slice(0, 5)) && !sigungus.has(row.id.slice(0, 5)));
      sigungus.add(region.id.slice(0, 5));
      return region.id;
    };
    const regionPrices = async (dong, dealType) => {
      const res = await api(landlord, `/api/v1/market-prices/regions/${dong}?dealType=${dealType}`);
      assert.equal(res.status, 200);
      const text = await res.text();
      return { text, data: JSON.parse(text).data };
    };
    const lastAttemptOf = async (sigunguCode, dealKind) =>
      (await prisma.marketCollection.findFirst({ where: { sigunguCode, dealKind }, orderBy: { attemptedAt: 'desc' } })).attemptedAt.toISOString();
    const lastFailureOf = async (sigunguCode, dealKind) =>
      (await prisma.marketCollection.findFirst({ where: { sigunguCode, dealKind, collectedAt: null }, orderBy: { attemptedAt: 'desc' } })).attemptedAt.toISOString();

    test('한 번도 안 시도함 → 모두 성공 전(일부만 모음) → 일부 FAILED(코드 30), 매매 · 전월세는 따로 — 응답 · 요약 · 로그에 키 · 요청 주소 없음', async () => {
      const dong = await pickFreshDong();
      const sgg = dong.slice(0, 5);
      const months = retentionMonths(new Date()); // 응답도 지금 시각 기준
      process.env.DATA_GO_KR_SERVICE_KEY = FAKE_KEY;
      const urls = [];
      // 가장 오래된 달의 매매만 "등록되지 않은 키"(30), 나머지는 0건 정상
      const fetchImpl = async (url) => {
        urls.push(url);
        const params = new URL(url).searchParams;
        const failing = url.includes('RTMSDataSvcAptTradeDev') && params.get('DEAL_YMD') === months[0].replace('-', '');
        return { ok: true, status: 200, headers: new Headers(), text: async () => (failing ? KEY_ERROR_XML : EMPTY_XML) };
      };
      let clock = Date.now();
      const tick = () => {
        clock += 500;
        return clock;
      };

      // 1) 한 번도 안 시도함
      const untried = await regionPrices(dong, 'SALE');
      assert.equal(untried.data.collectionStatus, 'COLLECTING');
      assert.deepEqual(untried.data.collectionProgress, { requiredMonths: 13, collectedMonths: 0, failedMonths: 0, notTriedMonths: 13, lastAttemptedAt: null, lastFailedAt: null, lastErrorCode: null });

      // 2) 모두 성공 전 — 시간 한도로 최근 몇 묶음만(실패 없음)
      const partial = await collectMarketPrices({ sigunguCodes: [sgg], fetchImpl, now: tick, budgetMs: REQUEST_TIMEOUT_MS + 3000 });
      assert.equal(partial.failed, 0);
      const tradeDone = await prisma.marketCollection.count({ where: { sigunguCode: sgg, dealKind: 'TRADE', collectedAt: { not: null } } });
      assert.ok(tradeDone >= 1 && tradeDone < 13, String(tradeDone));
      const inProgress = await regionPrices(dong, 'SALE');
      assert.equal(inProgress.data.collectionStatus, 'COLLECTING');
      assert.deepEqual(inProgress.data.collectionProgress, {
        requiredMonths: 13, collectedMonths: tradeDone, failedMonths: 0, notTriedMonths: 13 - tradeDone, lastAttemptedAt: await lastAttemptOf(sgg, 'TRADE'), lastFailedAt: null, lastErrorCode: null,
      });

      // 3) 나머지를 모으다 가장 오래된 달의 매매만 30 으로 실패
      const full = await collectMarketPrices({ sigunguCodes: [sgg], fetchImpl, now: tick });
      assert.equal(full.failed, 1);
      assert.deepEqual(full.failures, [`${sgg} ${months[0]} TRADE 30`]);
      const failed = await regionPrices(dong, 'SALE');
      assert.equal(failed.data.collectionStatus, 'COLLECTING');
      // 키 오류(30)라 키 모양이 붙는다(#233) — FAKE_KEY 그대로(20자, 공백 · 따옴표 · % 없음, 16진수 아님)
      const noMark = { hadWhitespace: false, hadQuotes: false, hadPercent: false };
      assert.deepEqual(failed.data.collectionProgress, {
        requiredMonths: 13, collectedMonths: 12, failedMonths: 1, notTriedMonths: 0, lastAttemptedAt: await lastAttemptOf(sgg, 'TRADE'), lastFailedAt: await lastFailureOf(sgg, 'TRADE'), lastErrorCode: '30',
        keyShape: { rawLength: FAKE_KEY.length, cleanedLength: FAKE_KEY.length, ...noMark, cleanedIsHex: false },
      });
      // 환경 변수를 바꾸면 다시 모으지 않아도 다음 응답의 키 모양이 바로 바뀐다(표에 적지 않음) — 따옴표 + 줄바꿈이 붙은 값
      process.env.DATA_GO_KR_SERVICE_KEY = `"${FAKE_KEY}"\n`;
      const reshaped = await regionPrices(dong, 'SALE');
      assert.deepEqual(reshaped.data.collectionProgress.keyShape, {
        rawLength: FAKE_KEY.length + 3, cleanedLength: FAKE_KEY.length, hadWhitespace: true, hadQuotes: true, hadPercent: false, cleanedIsHex: false,
      });
      assertNoLeak(reshaped.text, '키 모양');
      process.env.DATA_GO_KR_SERVICE_KEY = FAKE_KEY;
      // 로그 한 줄에도 같은 키 모양(30 실패가 있어서)
      assert.deepEqual(JSON.parse(formatCollectionLog(full).slice('[market-prices] cron '.length)).keyShape, failed.data.collectionProgress.keyShape);
      // 전월세는 13개월 다 모았다 — READY 응답은 그대로(collectionProgress 칸 없음)
      const jeonse = await regionPrices(dong, 'JEONSE');
      assert.equal(jeonse.data.collectionStatus, 'READY');
      assert.ok(!('collectionProgress' in jeonse.data));

      // 키는 요청 주소에만 — 응답 · 수집 요약 · 로그 한 줄 어디에도 없다
      assert.ok(urls.length > 0 && urls.every((url) => new URL(url).searchParams.get('serviceKey') === FAKE_KEY));
      for (const [label, text] of [['안 해 봄', untried.text], ['모으는 중', inProgress.text], ['실패', failed.text], ['READY', jeonse.text]]) assertNoLeak(text, label);
      for (const summary of [partial, full]) {
        assertNoLeak(JSON.stringify(summary), '요약');
        assertNoLeak(formatCollectionLog(summary), '로그');
      }
      const stored = await prisma.marketCollection.findMany({ where: { sigunguCode: sgg }, select: { lastErrorCode: true } });
      assertNoLeak(JSON.stringify(stored), 'market_collections');
    });

    test('NO_KEY: 키 없이 수집하면 원천을 부르지 않고 모든 달이 FAILED NO_KEY — 응답의 lastErrorCode 가 NO_KEY', async () => {
      const dong = await pickFreshDong();
      const sgg = dong.slice(0, 5);
      delete process.env.DATA_GO_KR_SERVICE_KEY;
      const calls = [];
      const fetchImpl = async (url) => {
        calls.push(url);
        throw new Error('키가 없으면 부르지 않아야 한다');
      };
      const summary = await collectMarketPrices({ sigunguCodes: [sgg], fetchImpl, now: () => Date.now() });
      assert.equal(calls.length, 0);
      assert.deepEqual([summary.planned, summary.done, summary.failed, summary.calls], [26, 0, 26, 0]);
      assert.equal(summary.failures.length, 10);
      assert.ok(summary.failures.every((line) => new RegExp(`^${sgg} \\d{4}-\\d{2} (TRADE|RENT) NO_KEY$`).test(line)), summary.failures.join(' / '));
      for (const dealType of ['SALE', 'JEONSE', 'MONTHLY']) {
        const { data, text } = await regionPrices(dong, dealType);
        assert.equal(data.collectionStatus, 'COLLECTING');
        const { lastAttemptedAt, lastFailedAt, ...counts } = data.collectionProgress;
        // NO_KEY 라 키 모양이 붙는다 — 키가 없으니 길이 0 · 모두 false(#233)
        assert.deepEqual(counts, {
          requiredMonths: 13, collectedMonths: 0, failedMonths: 13, notTriedMonths: 0, lastErrorCode: 'NO_KEY',
          keyShape: { rawLength: 0, cleanedLength: 0, hadWhitespace: false, hadQuotes: false, hadPercent: false, cleanedIsHex: false },
        });
        assert.equal(lastAttemptedAt, await lastAttemptOf(sgg, dealType === 'SALE' ? 'TRADE' : 'RENT'));
        assert.equal(lastFailedAt, lastAttemptedAt); // 모든 달이 실패만 — 마지막 실패 = 마지막 시도
        assertNoLeak(text, dealType);
      }
    });
  });

  test('cron 경로: CRON_SECRET 이 없으면 숨기고(404), 있으면 Bearer 가 틀릴 때 401', async () => {
    const res = await fetch(`${origin}/api/cron/market-prices`, { headers: { Authorization: 'Bearer wrong' } });
    assert.equal(res.status, process.env.CRON_SECRET ? 401 : 404);
  });
});
