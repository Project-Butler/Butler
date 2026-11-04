import { useQuery } from '@tanstack/react-query';
import { getCommunityNewsList, queryKey } from '@butler/api-client';

// 뉴스 화면 "우리 지역" 칸 아래의 시·도 묶음. 시·군·구 기사가 모자랄 때만(목록 meta.sidoFallback) 최대 10건, 더 보기 없음.
const SIDO_SIZE = 10;

export const useGetCommunityNewsSidoList = ({ legalDongCode, enabled }) =>
  useQuery({
    queryKey: [queryKey.COMMUNITY_NEWS, legalDongCode, 'SIDO'],
    queryFn: () => getCommunityNewsList({ legalDongCode, scope: 'SIDO', page: 1, size: SIDO_SIZE }),
    enabled: Boolean(legalDongCode) && enabled,
  });
