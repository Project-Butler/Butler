import { useQuery } from '@tanstack/react-query';
import { getMyBuildings, queryKey } from '@butler/api-client';

// 커뮤니티 건물 선택 화면 · 건물 바꾸기. 페이지를 나누지 않는 목록이라 useInfiniteQuery 가 아니라 useQuery 다.
// queryFn 은 부를 때 함수를 찾는다(다른 커뮤니티 훅과 같은 모양) — 호출 함수가 없는 환경(일부만 흉내 낸 테스트)에서도
// 화면 전체가 멈추지 않고 이 조회만 실패로 끝난다.
export const useGetMyBuildings = () =>
  useQuery({
    queryKey: [queryKey.COMMUNITY_MY_BUILDINGS],
    queryFn: () => getMyBuildings(),
  });
