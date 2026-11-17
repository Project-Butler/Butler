import { useQuery } from '@tanstack/react-query';
import { getComplexMarketPrices, queryKey } from '@butler/api-client';

// 단지 시세(시세 탭 · 브리핑). GET /market-prices/complexes/:complexId — 응답은 연동 규격 2장 시세 모양(국토교통부 실거래가, 금액은 원).
// dealType: 'SALE' | 'JEONSE' | 'MONTHLY', areaMin · areaMax: ㎡(없으면 그쪽 끝이 열린 구간)
// 쿼리 키에 유형 · 면적대가 들어 있어 전환하면 다시 가져온다(한 번 본 조합은 캐시).
export const useGetMarketPrices = ({ complexId, dealType, areaMin, areaMax, enabled = true }) =>
  useQuery({
    queryKey: [queryKey.MARKET_PRICES, complexId, dealType, areaMin ?? null, areaMax ?? null],
    queryFn: () => getComplexMarketPrices({ complexId, dealType, areaMin, areaMax }),
    enabled: Boolean(complexId) && enabled,
  });
