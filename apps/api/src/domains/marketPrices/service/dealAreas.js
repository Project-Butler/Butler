// 단지마다 이어진 거래의 전용면적 목록(my-buildings dealAreas, #274) — 규칙 · 이유는 marketPriceRules.js "단지의 거래 면적".
// 저장된 표(market_deals)만 읽는다 — 외부 API 를 부르지 않는다(요청 경로).

import { prisma } from '../../../platform/prismaClient.js';
import { DEAL_AREA_DECIMALS } from '../marketPriceRules.js';
import { firstDayOf, lastDayOf, retentionMonths } from '../months.js';

const roundArea = (area) => Number(area.toFixed(DEAL_AREA_DECIMALS));

// complexIds → Map(complexId → 전용면적 오름차순 · 겹침 없음). 이어진 거래가 없는 단지는 빈 배열.
// 기간은 보관 기간(이번 달 포함 13개월, 한국 시간), 거래 유형은 가리지 않는다. 날짜 칸으로 거른다 — 인덱스(complex_id, deal_type, contract_date)를 탄다
export const listDealAreasByComplex = async (complexIds, now = new Date()) => {
  const result = new Map(complexIds.map((complexId) => [complexId, []]));
  if (complexIds.length === 0) return result;
  const months = retentionMonths(now);
  const rows = await prisma.marketDeal.groupBy({
    by: ['complexId', 'exclusiveArea'],
    where: {
      complexId: { in: complexIds },
      exclusiveArea: { not: null },
      contractDate: { gte: firstDayOf(months[0]), lte: lastDayOf(months.at(-1)) },
    },
  });
  const areas = new Map();
  for (const { complexId, exclusiveArea } of rows) {
    if (!areas.has(complexId)) areas.set(complexId, new Set());
    areas.get(complexId).add(roundArea(exclusiveArea));
  }
  for (const [complexId, set] of areas) result.set(complexId, [...set].sort((a, b) => a - b));
  return result;
};
