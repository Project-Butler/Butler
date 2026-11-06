import { useInfiniteQuery } from '@tanstack/react-query';
import { getCommunityPollList, queryKey } from '@butler/api-client';

const PAGE_SIZE = 20;

// 투표 목록. "더 보기"로 다음 페이지를 이어 붙인다(useInfiniteQuery).
// scope: undefined(전체) | 'COMPLEX'(우리 단지) | 'REGION', status: 'OPEN' | 'CLOSED', complexId: 현재 건물
// size: 한 번에 가져오는 수(기본 20). 브리핑은 적게(5 · 3) 부른다 — 키에 넣어 탭 목록과 캐시가 섞이지 않게.
export const useGetCommunityPollList = ({ legalDongCode, scope, status, complexId, size = PAGE_SIZE, enabled = true }) =>
  useInfiniteQuery({
    queryKey: [queryKey.COMMUNITY_POLLS, legalDongCode, scope, status, complexId, size],
    queryFn: ({ pageParam }) =>
      getCommunityPollList({ legalDongCode, scope, status, complexId, page: pageParam, size }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.meta.hasNext ? lastPage.meta.page + 1 : undefined),
    enabled: Boolean(legalDongCode) && enabled,
  });
