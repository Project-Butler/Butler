// 시세 읽기(요청 경로) — 시세 계획서 6절, 응답은 연동 규격 2장 "시세" 와 같은 모양. **외부 API 를 부르지 않는다**(저장된 표만).
// 단지 시세 = 그 단지에 이어진 거래, 동 시세 = 그 법정동의 거래 전부(이어진 · 못 이은 것 모두).
// 아직 그 시군구를 다 모으지 못했으면 COLLECTING(monthly · recentDeals 빈 배열 + 요청한 사람 이름의 작업 id).

import { AppError } from '../../../platform/AppError.js';
import { prisma } from '../../../platform/prismaClient.js';
import { isUuid } from '../../../platform/uuid.js';
import { DEAL_TYPES, KEEP_MONTHS, RECENT_DEALS, SOURCE, areaRange } from '../marketPriceRules.js';
import { firstDayOf, isYearMonth, kstDate, kstYearMonth, lastDayOf, retentionMonths, shiftYearMonth, yearMonthsBetween } from '../months.js';
import { ensureBackfillJob } from './backfillJobs.js';
import { loadLinkIndex, relinkSigungu } from './collect.js';

const kindOf = (dealType) => (dealType === 'SALE' ? 'TRADE' : 'RENT');
const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

const invalid = (field, reason) => new AppError('MARKET_PRICE_INVALID_QUERY', 400, '시세 조회 조건이 올바르지 않습니다.', [{ field, reason }]);

const parseArea = (raw, field) => {
  if (raw === undefined || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw invalid(field, '0 이상의 숫자(㎡)');
  return value;
};

// 쿼리 → { dealType, areaMin, areaMax, from, to }. 기본 기간은 보관 기간과 같다 — 이번 달(한국 시간)까지 13개월(완성된 달 12개 + 이번 달)
export const parseMarketQuery = (query, now = new Date()) => {
  const { dealType } = query;
  if (!DEAL_TYPES.includes(dealType)) throw invalid('dealType', 'SALE · JEONSE · MONTHLY 중 하나(필수)');
  const areaMin = parseArea(query.areaMin, 'areaMin');
  const areaMax = parseArea(query.areaMax, 'areaMax');
  if (areaMin !== null && areaMax !== null && areaMin > areaMax) throw invalid('areaMin', 'areaMax 보다 클 수 없음');
  for (const field of ['fromYearMonth', 'toYearMonth']) {
    if (query[field] !== undefined && !isYearMonth(query[field])) throw invalid(field, "'YYYY-MM'");
  }
  const to = query.toYearMonth ?? kstYearMonth(now);
  const from = query.fromYearMonth ?? shiftYearMonth(to, -(KEEP_MONTHS - 1));
  if (from > to) throw invalid('fromYearMonth', 'toYearMonth 보다 늦을 수 없음');
  return { dealType, areaMin, areaMax, from, to };
};

// 그 시군구 · 종류의 모은 기록 → { coveredMonths(Set), coveredFromYearMonth, lastCollectedAt }
const loadCoverage = async (sigunguCode, kind) => {
  const rows = await prisma.marketCollection.findMany({
    where: { sigunguCode, dealKind: kind, collectedAt: { not: null } },
    select: { yearMonth: true, collectedAt: true },
  });
  const months = rows.map((row) => row.yearMonth).sort();
  const lastCollectedAt = rows.reduce((latest, row) => (!latest || row.collectedAt > latest ? row.collectedAt : latest), null);
  return { coveredMonths: new Set(months), coveredFromYearMonth: months[0] ?? null, lastCollectedAt };
};

// 매달 하나(거래가 있는 달만 — 화면이 빈 달을 null 로 그린다). 금액은 원, 평균은 반올림
export const toMonthly = (deals, dealType) => {
  const byMonth = new Map();
  for (const deal of deals) {
    const month = deal.contractYearMonth;
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(deal);
  }
  const average = (values) => (values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null);
  return [...byMonth.keys()].sort().map((yearMonth) => {
    const rows = byMonth.get(yearMonth);
    const prices = rows.map((row) => toNumber(row.price)).filter((value) => value !== null);
    const deposits = rows.map((row) => toNumber(row.deposit)).filter((value) => value !== null);
    const rents = rows.map((row) => toNumber(row.monthlyRent)).filter((value) => value !== null);
    return {
      yearMonth,
      dealCount: rows.length,
      avgPrice: dealType === 'SALE' ? average(prices) : null,
      minPrice: dealType === 'SALE' && prices.length ? Math.min(...prices) : null,
      maxPrice: dealType === 'SALE' && prices.length ? Math.max(...prices) : null,
      avgDeposit: dealType === 'SALE' ? null : average(deposits),
      avgMonthlyRent: dealType === 'MONTHLY' ? average(rents) : null,
    };
  });
};

const toRecentDeal = (deal, complexNames) => ({
  contractDate: deal.contractDate.toISOString().slice(0, 10),
  dealType: deal.dealType,
  complexName: (deal.complexId && complexNames.get(deal.complexId)) || deal.aptName,
  exclusiveArea: deal.exclusiveArea,
  floor: deal.floor,
  price: toNumber(deal.price),
  deposit: toNumber(deal.deposit),
  monthlyRent: toNumber(deal.monthlyRent),
});

// 공통: scope 의 거래를 읽어 규격 모양으로. complexCreatedAt 은 단지 시세에서만(마지막 수집 뒤에 등록된 단지면 읽기 전에 잇는다)
const buildPrices = async ({ user, scope, complexId, legalDongCode, sigunguCode, complexCreatedAt, query, now }) => {
  const kind = kindOf(query.dealType);
  const common = {
    scope,
    complexId: scope === 'COMPLEX' ? complexId : null,
    legalDongCode,
    dealType: query.dealType,
    areaMin: query.areaMin,
    areaMax: query.areaMax,
    source: SOURCE,
  };
  const coverage = await loadCoverage(sigunguCode, kind);
  // 요청 기간 중 보관 기간 안의 달은 모두 모아져 있어야 READY(보관 기간 밖은 "있는 기간만" — coveredFromYearMonth 로 알린다)
  const keep = new Set(retentionMonths(now));
  const required = yearMonthsBetween(query.from, query.to).filter((month) => keep.has(month));
  const missing = required.filter((month) => !coverage.coveredMonths.has(month));
  if (missing.length > 0 || !coverage.lastCollectedAt) {
    const jobId = await ensureBackfillJob(user.id, sigunguCode);
    return { ...common, coveredFromYearMonth: null, asOf: null, collectionStatus: 'COLLECTING', jobId, monthly: [], recentDeals: [] };
  }
  // 마지막 수집 뒤에 등록된 단지 — 원천을 부르지 않고 저장된 거래를 지금 잇는다(DB 만, 다음 정기 실행 전까지만 일어난다)
  if (complexCreatedAt && complexCreatedAt > coverage.lastCollectedAt) await relinkSigungu(sigunguCode, await loadLinkIndex(sigunguCode));

  // 면적: areaMin < 전용면적 ≤ areaMax(규칙 파일 areaRange — 한 거래가 이웃한 두 칩에 나오지 않게)
  const area = areaRange(query.areaMin, query.areaMax);
  const deals = await prisma.marketDeal.findMany({
    where: {
      ...(scope === 'COMPLEX' ? { complexId } : { legalDongCode }),
      dealType: query.dealType,
      contractDate: { gte: firstDayOf(query.from), lte: lastDayOf(query.to) },
      ...(Object.keys(area).length ? { exclusiveArea: area } : {}),
    },
    select: { contractYearMonth: true, contractDate: true, dealType: true, complexId: true, aptName: true, exclusiveArea: true, floor: true, price: true, deposit: true, monthlyRent: true },
    orderBy: [{ contractDate: 'desc' }, { id: 'asc' }],
  });
  const recent = deals.slice(0, RECENT_DEALS);
  const ids = [...new Set(recent.map((deal) => deal.complexId).filter(Boolean))];
  const complexes = ids.length ? await prisma.complex.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(complexes.map((complex) => [complex.id, complex.name]));
  return {
    ...common,
    coveredFromYearMonth: coverage.coveredFromYearMonth,
    asOf: kstDate(coverage.lastCollectedAt),
    collectionStatus: 'READY',
    jobId: null,
    monthly: toMonthly(deals, query.dealType),
    recentDeals: recent.map((deal) => toRecentDeal(deal, names)),
  };
};

// GET /api/v1/market-prices/complexes/:complexId
export const findComplexMarketPrices = async (user, complexId, rawQuery, { now = new Date() } = {}) => {
  const complex = isUuid(complexId) ? await prisma.complex.findUnique({ where: { id: complexId }, select: { id: true, regionId: true, createdAt: true } }) : null;
  if (!complex) throw new AppError('COMPLEX_NOT_FOUND', 404, '단지를 찾을 수 없습니다.');
  const query = parseMarketQuery(rawQuery, now);
  return buildPrices({
    user,
    scope: 'COMPLEX',
    complexId: complex.id,
    legalDongCode: complex.regionId,
    sigunguCode: complex.regionId.slice(0, 5),
    complexCreatedAt: complex.createdAt,
    query,
    now,
  });
};

// GET /api/v1/market-prices/regions/:legalDongCode
export const findRegionMarketPrices = async (user, legalDongCode, rawQuery, { now = new Date() } = {}) => {
  const region = /^\d{10}$/.test(legalDongCode ?? '') ? await prisma.region.findUnique({ where: { id: legalDongCode }, select: { id: true } }) : null;
  if (!region) throw new AppError('REGION_NOT_FOUND', 404, '법정동을 찾을 수 없습니다.');
  const query = parseMarketQuery(rawQuery, now);
  return buildPrices({ user, scope: 'REGION', complexId: null, legalDongCode: region.id, sigunguCode: region.id.slice(0, 5), complexCreatedAt: null, query, now });
};
