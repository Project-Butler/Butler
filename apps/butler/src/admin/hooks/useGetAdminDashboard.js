import { useCallback, useEffect, useState } from 'react';
import { getAdminDashboard } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../shared/apiError';

// 관리자 대시보드 요약 카운트(GET /admin/dashboard).
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetAdminDashboard = ({ onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const data = await getAdminDashboard();
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
  }, [reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, refetch };
};
