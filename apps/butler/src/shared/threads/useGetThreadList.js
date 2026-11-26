import { useMemo } from 'react';
import { useApiQuery } from '../useApiQuery';
import { threadListQuery } from './threadListQuery';
import { sortThreadsForList } from './threadView';

// 내가 참여한 대화 목록(GET /threads, 최근 100개). 읽기 전용(지난 대화)은 맨 아래로 내린다.
// 반환: { items, error, isLoading, refetch }. 401이면 onUnauthorized.
export const useGetThreadList = ({ onUnauthorized, enabled = true } = {}) => {
  const { data, error, isLoading, refetch } = useApiQuery({ ...threadListQuery, enabled, onUnauthorized });
  const items = useMemo(() => (data ? sortThreadsForList(data.data) : []), [data]);
  return { items, error, isLoading, refetch };
};
