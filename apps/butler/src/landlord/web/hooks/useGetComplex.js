import { useCallback, useEffect, useState } from 'react';
import { getComplex } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

// 단지 상세(GET /complexes/:complexId) — 주소·법정동·건물 정보.
// complexId가 없으면 호출하지 않는다. 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetComplex = (complexId, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: Boolean(complexId) });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!complexId) {
      setState({ data: null, error: null, isLoading: false });
      return undefined;
    }

    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const data = await getComplex(complexId);
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
  }, [complexId, reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, refetch };
};
