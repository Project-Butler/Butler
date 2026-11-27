import axiosInstance from '../../axios/axiosInstance';

// 단지 시세(국토교통부 실거래가). params: { dealType('SALE'|'JEONSE'|'MONTHLY', 필수), areaMin, areaMax(㎡, 양끝 포함), fromYearMonth, toYearMonth }
export const getComplexMarketPrices = async ({ complexId, ...params }) => {
  const { data } = await axiosInstance.get(`/market-prices/complexes/${complexId}`, { params });
  // 연동 규격 2장 시세: { scope: 'COMPLEX', complexId, legalDongCode, dealType, areaMin, areaMax, coveredFromYearMonth, asOf, source,
  //   collectionStatus: 'READY'|'COLLECTING', jobId, monthly: [{ yearMonth, dealCount, avgPrice, minPrice, maxPrice, avgDeposit, avgMonthlyRent }],
  //   recentDeals: [{ contractDate, dealType, complexName, exclusiveArea, floor, price, deposit, monthlyRent }] } — 금액은 원
  // COLLECTING 일 때만 collectionProgress(그 시군구 · 그 종류, 보관 기간의 달 기준 — READY 에는 없음):
  //   { requiredMonths, collectedMonths, failedMonths, notTriedMonths(셋을 더하면 requiredMonths), lastAttemptedAt(ISO | null),
  //     lastFailedAt(가장 최근 실패의 시도 시각, ISO | null — lastAttemptedAt 과 비교해 실패 코드가 오늘 것인지 가린다), lastErrorCode('NO_KEY' · '30' · 'TIMEOUT' … | null) }
  return data.data;
};
