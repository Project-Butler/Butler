import { useCallback, useRef, useState } from 'react';
import { postThread } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../apiError';

// 계약·요청의 대화 열기(POST /threads). 멱등이라 이미 있으면 그 대화를 돌려준다.
// 임차인이 연결되지 않은 계약, 임대인이 직접 만든 요청은 422 THREAD_CONTEXT_NOT_SUPPORTED.
// openThread(contextType, contextId)는 { data, error }를 돌려준다. 이미 요청 중이면 { data: null, error: null }.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useOpenThread = ({ onUnauthorized } = {}) => {
  const [state, setState] = useState({ error: null, isLoading: false });
  const pendingRef = useRef(false);

  const openThread = useCallback(
    async (contextType, contextId) => {
      if (pendingRef.current) return { data: null, error: null };
      pendingRef.current = true;
      setState({ error: null, isLoading: true });

      try {
        const data = await postThread({ contextType, contextId });
        setState({ error: null, isLoading: false });
        return { data, error: null };
      } catch (error) {
        if (isUnauthorizedError(error)) {
          setState({ error: null, isLoading: false });
          onUnauthorized?.();
          return { data: null, error: null };
        }
        const apiError = toApiError(error);
        setState({ error: apiError, isLoading: false });
        return { data: null, error: apiError };
      } finally {
        pendingRef.current = false;
      }
    },
    [onUnauthorized],
  );

  return { ...state, openThread };
};
