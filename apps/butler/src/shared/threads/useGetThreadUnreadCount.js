import { useApiQuery } from '../useApiQuery';
import { threadListQuery } from './threadListQuery';
import { countUnreadThreads } from './threadView';

// 위 막대 말풍선 숫자: 안 읽은 메시지가 있는 대화 수. 목록과 같은 쿼리를 써서 따로 요청하지 않는다.
// 아직 모르거나 실패하면 0(숫자를 붙이지 않는다).
export const useGetThreadUnreadCount = ({ onUnauthorized, enabled = true } = {}) => {
  const { data } = useApiQuery({
    ...threadListQuery,
    select: (page) => countUnreadThreads(page.data),
    enabled,
    onUnauthorized,
  });
  return data ?? 0;
};
