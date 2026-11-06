import { useCallback, useEffect, useState } from 'react';
import { getActivityList } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

// 최근 활동(GET /activities). data = 활동 배열(최신순).
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetActivityList = ({ size = 10 } = {}, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const data = await getActivityList({ size });
        if (!ignore) setState({ data, error: null, isLoading: false });
      } catch (error) {
        if (ignore) return;
        if (isUnauthorizedError(error)) {
          onUnauthorized?.();
          return;
        }
        setState({ data: null, error: toApiError(error), isLoading: false });
      }
    };
    load();

    return () => {
      ignore = true;
    };
  }, [size, reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, refetch };
};
