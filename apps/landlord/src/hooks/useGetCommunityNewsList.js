import { useInfiniteQuery } from '@tanstack/react-query';
import { getCommunityNewsList, queryKey } from '@butler/api-client';

const PAGE_SIZE = 20;

// 뉴스 화면의 기사 목록. "더 보기"로 다음 페이지를 이어 붙인다(useInfiniteQuery).
// scope: 'SIGUNGU'(우리 지역) | 'NATIONWIDE'(전국 정책)
// size: 한 번에 가져오는 수(기본 20). 브리핑은 적게(5 · 3) 부른다 — 키에 넣어 탭 목록과 캐시가 섞이지 않게.
export const useGetCommunityNewsList = ({ legalDongCode, scope, size = PAGE_SIZE }) =>
  useInfiniteQuery({
    queryKey: [queryKey.COMMUNITY_NEWS, legalDongCode, scope, size],
    queryFn: ({ pageParam }) => getCommunityNewsList({ legalDongCode, scope, page: pageParam, size }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.meta.hasNext ? lastPage.meta.page + 1 : undefined),
    enabled: Boolean(legalDongCode),
  });
