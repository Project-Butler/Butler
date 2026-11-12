import { useQuery } from '@tanstack/react-query';
import { queryKey } from '@butler/api-client';
import { getMarketPricesStub } from '../utils/communityMarketPriceStub';

// 단지 시세(시세 화면). 입력·응답은 연동 규격 GET /complexes/:complexId/market-prices 와 같다.
// dealType: 'SALE' | 'JEONSE' | 'MONTHLY', areaMin · areaMax: ㎡(없으면 그쪽 끝이 열린 구간)
// 쿼리 키에 유형·면적대가 들어 있어 전환하면 다시 가져온다(한 번 본 조합은 캐시).
export const useGetMarketPrices = ({ complexId, dealType, areaMin, areaMax, enabled = true }) =>
  useQuery({
    queryKey: [queryKey.COMMUNITY_MARKET_PRICES, complexId, dealType, areaMin ?? null, areaMax ?? null],
    // 플랫폼 시세 API 가 생기면 여기만 교체 — api-client 함수(예: getComplexMarketPrices)로 바꾸고 utils/communityMarketPriceStub.js 를 지운다
    queryFn: () => getMarketPricesStub({ complexId, dealType, areaMin, areaMax }),
    enabled: Boolean(complexId) && enabled,
  });
