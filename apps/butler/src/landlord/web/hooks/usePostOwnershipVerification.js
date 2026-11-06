import { useCallback, useRef, useState } from 'react';
import { postOwnershipVerification } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

const INITIAL_STATE = { data: null, error: null, isLoading: false };

// 권리자 인증 시작(POST /ownership-verifications, 202). 입력한 생년월일은 이 hook의 상태에 두지 않는다.
// startVerification()은 { data, error }를 돌려준다. 이미 요청 중이면 다시 보내지 않고 { data: null, error: null }.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const usePostOwnershipVerification = ({ onUnauthorized } = {}) => {
  const [state, setState] = useState(INITIAL_STATE);
  const pendingRef = useRef(false);

  const startVerification = useCallback(
    async (body) => {
      if (pendingRef.current) return { data: null, error: null };
      pendingRef.current = true;
      setState({ data: null, error: null, isLoading: true });

      try {
        const data = await postOwnershipVerification(body);
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

  return { ...state, startVerification };
};
