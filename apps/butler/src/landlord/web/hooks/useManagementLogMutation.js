import { useCallback, useRef, useState } from 'react';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

const INITIAL_STATE = { data: null, error: null, isLoading: false };

// 관리 로그 쓰기 요청 공통. mutate(...args)는 { data, error }를 돌려준다.
// 이미 요청 중이면 다시 보내지 않고 { data: null, error: null }. 401이면 오류 대신 onUnauthorized를 부른다.
export const useManagementLogMutation = (request, { onUnauthorized } = {}) => {
  const [state, setState] = useState(INITIAL_STATE);
  const pendingRef = useRef(false);

  const mutate = useCallback(
    async (...args) => {
      if (pendingRef.current) return { data: null, error: null };
      pendingRef.current = true;
      setState({ data: null, error: null, isLoading: true });

      try {
        // DELETE는 돌려주는 값이 없어서 성공을 true로 알린다.
        const data = (await request(...args)) ?? true;
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

  return { ...state, mutate };
};
