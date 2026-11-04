import { useQuery } from '@tanstack/react-query';
import { getMyBuildings, queryKey } from '@butler/api-client';

// 커뮤니티 건물 선택 화면 · 건물 바꾸기. 페이지를 나누지 않는 목록이라 useInfiniteQuery 가 아니라 useQuery 다.
export const useGetMyBuildings = () =>
  useQuery({
    queryKey: [queryKey.COMMUNITY_MY_BUILDINGS],
    queryFn: getMyBuildings,
  });
