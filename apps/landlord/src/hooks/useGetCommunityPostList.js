import { useInfiniteQuery } from '@tanstack/react-query';
import { getCommunityPostList, queryKey } from '@butler/api-client';

const PAGE_SIZE = 20;

// 게시판 목록. "더 보기"로 다음 페이지를 이어 붙인다(useInfiniteQuery).
// 첫 페이지 meta 에 법정동 이름(region)과 글쓰기 자격(canWrite)이 같이 온다.
export const useGetCommunityPostList = ({ legalDongCode, category, mine }) =>
  useInfiniteQuery({
    queryKey: [queryKey.COMMUNITY_POSTS, legalDongCode, category, mine],
    queryFn: ({ pageParam }) =>
      getCommunityPostList({ legalDongCode, category, mine: mine || undefined, page: pageParam, size: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.meta.hasNext ? lastPage.meta.page + 1 : undefined),
    enabled: Boolean(legalDongCode),
  });
