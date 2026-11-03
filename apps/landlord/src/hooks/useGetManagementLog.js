import { useEffect, useState } from 'react';
import { getManagementLog } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

// 관리 로그 상세(GET /management-logs/:logId). 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetManagementLog = (logId, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });

  useEffect(() => {
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
  }, [logId, onUnauthorized]);

  return state;
};
