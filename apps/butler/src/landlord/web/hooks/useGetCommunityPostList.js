import { useInfiniteQuery } from '@tanstack/react-query';
import { getCommunityPostList, queryKey } from '@butler/api-client';

const PAGE_SIZE = 20;

// 게시판 목록. "더 보기"로 다음 페이지를 이어 붙인다(useInfiniteQuery).
// 첫 페이지 meta 에 법정동 이름(region)과 글쓰기 자격(canWrite)이 같이 온다.
// size: 한 번에 가져오는 수(기본 20). 브리핑은 적게(5 · 3) 부른다 — 키에 넣어 탭 목록과 캐시가 섞이지 않게.
export const useGetCommunityPostList = ({ legalDongCode, category, mine, size = PAGE_SIZE }) =>
  useInfiniteQuery({
    queryKey: [queryKey.COMMUNITY_POSTS, legalDongCode, category, mine, size],
    queryFn: ({ pageParam }) =>
      getCommunityPostList({ legalDongCode, category, mine: mine || undefined, page: pageParam, size }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.meta.hasNext ? lastPage.meta.page + 1 : undefined),
    enabled: Boolean(legalDongCode),
  });
