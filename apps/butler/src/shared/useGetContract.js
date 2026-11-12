import { useCallback, useEffect, useState } from 'react';
import { getContract } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from './apiError';

// 계약 상세(GET /contracts/:contractId). 운영자에게 보이는 범위는 서버가 정한다(memo는 null).
// contractId가 없으면 호출하지 않는다. 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetContract = (contractId, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: Boolean(contractId) });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!contractId) {
      setState({ data: null, error: null, isLoading: false });
      return undefined;
    }

    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const data = await getContract(contractId);
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
  }, [contractId, reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, refetch };
};
