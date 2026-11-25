import { getManagementLog, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';

// 관리 로그 상세(GET /management-logs/:logId). 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
// logId가 없으면 부르지 않는다(관리 로그 오른쪽 패널에서 아직 고르지 않은 때). 다른 기록으로 바뀌면 그 기록의 캐시(없으면 로딩)를 보여 준다.
export const useGetManagementLog = (logId, { onUnauthorized } = {}) =>
  useApiQuery({
    queryKey: [queryKey.MANAGEMENT_LOG_DETAIL, logId],
    queryFn: () => getManagementLog(logId),
    enabled: Boolean(logId),
    onUnauthorized,
  });
