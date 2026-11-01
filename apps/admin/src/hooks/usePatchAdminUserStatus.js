import { useCallback, useRef, useState } from 'react';
import { patchAdminUserStatus } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

const INITIAL_STATE = { data: null, error: null, isLoading: false };

// 회원 정지·해제(PATCH /admin/users/:userId/status). 정지하면 그 회원의 세션이 모두 끊긴다.
// updateStatus()는 { data, error }를 돌려준다. 이미 요청 중이면 다시 보내지 않고 { data: null, error: null }.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const usePatchAdminUserStatus = ({ onUnauthorized } = {}) => {
  const [state, setState] = useState(INITIAL_STATE);
  const pendingRef = useRef(false);

  const updateStatus = useCallback(
    async (userId, body) => {
      if (pendingRef.current) return { data: null, error: null };
      pendingRef.current = true;
      setState({ data: null, error: null, isLoading: true });

      try {
        const data = await patchAdminUserStatus(userId, body);
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
    [onUnauthorized],
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { ...state, updateStatus, reset };
};
