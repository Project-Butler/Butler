import { useCallback, useRef, useState } from 'react';
import { postTicket } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

const INITIAL_STATE = { data: null, error: null, isLoading: false };

// 수리·점검 요청 등록(POST /tickets). 임대인이 만들면 본인 활성 소유 관계에 연결된다(내 호실이 아니면 404 PROPERTY_NOT_FOUND).
// createTicket()은 { data, error }를 돌려준다. 이미 요청 중이면 다시 보내지 않고 { data: null, error: null }.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const usePostTicket = ({ onUnauthorized } = {}) => {
  const [state, setState] = useState(INITIAL_STATE);
  const pendingRef = useRef(false);

  const createTicket = useCallback(
    async (body) => {
      if (pendingRef.current) return { data: null, error: null };
      pendingRef.current = true;
      setState({ data: null, error: null, isLoading: true });

      try {
        const data = await postTicket(body);
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

  return { ...state, createTicket };
};
