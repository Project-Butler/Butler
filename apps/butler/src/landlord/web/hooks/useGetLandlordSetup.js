import { useCallback, useEffect, useState } from 'react';
import { getLandlordSetup } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

// 초기 세팅 진행 현황(GET /dashboard/landlord/setup).
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetLandlordSetup = ({ onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const data = await getLandlordSetup();
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
