import { useCallback, useEffect, useState } from 'react';
import { getManagementLog } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

// 관리 로그 상세(GET /management-logs/:logId). 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
// logId가 없으면 부르지 않는다(관리 로그 오른쪽 패널에서 아직 고르지 않은 때). 다른 기록으로 바뀌면 이전 기록을 비운다.
export const useGetManagementLog = (logId, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: Boolean(logId) });
  const [reloadCount, setReloadCount] = useState(0);
  const refetch = useCallback(() => setReloadCount((prev) => prev + 1), []);

  useEffect(() => {
    setState({ data: null, error: null, isLoading: Boolean(logId) });
  }, [logId]);

  useEffect(() => {
    if (!logId) return undefined;
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const data = await getManagementLog(logId);
        if (!ignore) setState({ data, error: null, isLoading: false });
      } catch (error) {
        if (ignore) return;
        if (isUnauthorizedError(error)) {
          onUnauthorized?.();
          return;
        }
        setState((prev) => ({ ...prev, error: toApiError(error), isLoading: false }));
      }
    };
    load();

    return () => {
      ignore = true;
    };
  }, [logId, onUnauthorized, reloadCount]);

  return { ...state, refetch };
};
