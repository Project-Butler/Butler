import { useInfiniteQuery } from '@tanstack/react-query';
import { getCommunityPollList, queryKey } from '@butler/api-client';

const PAGE_SIZE = 20;

// 투표 목록. "더 보기"로 다음 페이지를 이어 붙인다(useInfiniteQuery).
// scope: undefined(전체) | 'COMPLEX'(우리 단지) | 'REGION', status: 'OPEN' | 'CLOSED', complexId: 현재 건물
export const useGetCommunityPollList = ({ legalDongCode, scope, status, complexId }) =>
  useInfiniteQuery({
    queryKey: [queryKey.COMMUNITY_POLLS, legalDongCode, scope, status, complexId],
    queryFn: ({ pageParam }) =>
      getCommunityPollList({ legalDongCode, scope, status, complexId, page: pageParam, size: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.meta.hasNext ? lastPage.meta.page + 1 : undefined),
    enabled: Boolean(legalDongCode),
  });
