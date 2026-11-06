import { useCallback, useRef, useState } from 'react';
import { isUnauthorizedError, toApiError } from '../../shared/apiError';

const INITIAL_STATE = { data: null, error: null, isLoading: false };

// 쓰기 요청(POST 등) 공용 hook. request(...args)는 mutate(...args)를 그대로 넘겨 부른다.
// mutate()는 { data, error }를 돌려준다. 이미 요청 중이면 다시 보내지 않고 { data: null, error: null }.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useMutationRequest = (request, { onUnauthorized } = {}) => {
  const [state, setState] = useState(INITIAL_STATE);
  const pendingRef = useRef(false);

  const mutate = useCallback(
    async (...args) => {
      if (pendingRef.current) return { data: null, error: null };
      pendingRef.current = true;
      setState({ data: null, error: null, isLoading: true });

      try {
        const data = await request(...args);
        setState({ data, error: null, isLoading: false });
        return { data, error: null };
      } catch (error) {
        if (isUnauthorizedError(error)) {
          setState(INITIAL_STATE);
          onUnauthorized?.();
          return { data: null, error: null };
        }
        const apiError = toApiError(error);
        setState({ data: null, error: apiError, isLoading: false });
        return { data: null, error: apiError };
      } finally {
        pendingRef.current = false;
      }
    },
    [request, onUnauthorized],
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { ...state, mutate, reset };
};
