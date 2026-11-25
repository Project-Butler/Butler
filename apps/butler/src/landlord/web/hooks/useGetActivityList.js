import { getActivityList, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';

// 최근 활동(GET /activities). data = 활동 배열(최신순).
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetActivityList = ({ size = 10 } = {}, { onUnauthorized } = {}) =>
  useApiQuery({
    queryKey: [queryKey.ACTIVITIES, { size }],
    queryFn: () => getActivityList({ size }),
    onUnauthorized,
  });
