import { getThreadList, queryKey } from '@butler/api-client';

// 대화 목록 쿼리 옵션 한 곳. 목록 훅과 안 읽은 수 훅(위 막대 말풍선)이 같은 옵션을 써서
// 같은 키로 30초에 한 번만 받는다(위 막대만 떠 있어도 폴링된다).
// - 창이 가려져 있으면 건너뛴다(refetchIntervalInBackground 기본 false).
// - 창으로 돌아오면 다시 받는다(전역 기본 refetchOnWindowFocus:false 를 이 쿼리만 켠다). 10초 안에 돌아오면 받지 않는다.
export const THREAD_LIST_SIZE = 100;
export const THREAD_LIST_POLL_MS = 30_000;
export const THREAD_LIST_STALE_MS = 10_000;

export const threadListQuery = {
  queryKey: [queryKey.THREADS, { size: THREAD_LIST_SIZE }],
  queryFn: () => getThreadList({ size: THREAD_LIST_SIZE }),
  refetchInterval: THREAD_LIST_POLL_MS,
  refetchOnWindowFocus: true,
  staleTime: THREAD_LIST_STALE_MS,
};
