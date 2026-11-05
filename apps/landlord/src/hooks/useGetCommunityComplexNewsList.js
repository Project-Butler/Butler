import { useInfiniteQuery } from '@tanstack/react-query';
import { getCommunityComplexNewsList, queryKey } from '@butler/api-client';

const PAGE_SIZE = 5;

// 우리 단지 뉴스(단지 이름이 제목에 들어간 기사). "더 보기"로 다음 페이지를 이어 붙인다(useInfiniteQuery).
// size: 한 번에 가져오는 수(뉴스 탭 5, 브리핑 2) — 키에 넣어 캐시가 섞이지 않게.
export const useGetCommunityComplexNewsList = ({ complexId, size = PAGE_SIZE }) =>
  useInfiniteQuery({
    queryKey: [queryKey.COMMUNITY_COMPLEX_NEWS, complexId, size],
    queryFn: ({ pageParam }) => getCommunityComplexNewsList({ complexId, page: pageParam, size }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.meta.hasNext ? lastPage.meta.page + 1 : undefined),
    enabled: Boolean(complexId),
  });
