import { useInfiniteQuery } from '@tanstack/react-query';
import { getCommunityNewsList, queryKey } from '@butler/api-client';

const PAGE_SIZE = 20;

// 뉴스 화면의 기사 목록. "더 보기"로 다음 페이지를 이어 붙인다(useInfiniteQuery).
// scope: 'SIGUNGU'(우리 지역) | 'NATIONWIDE'(전국 정책)
export const useGetCommunityNewsList = ({ legalDongCode, scope }) =>
  useInfiniteQuery({
    queryKey: [queryKey.COMMUNITY_NEWS, legalDongCode, scope],
    queryFn: ({ pageParam }) => getCommunityNewsList({ legalDongCode, scope, page: pageParam, size: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.meta.hasNext ? lastPage.meta.page + 1 : undefined),
    enabled: Boolean(legalDongCode),
  });
