import { useCallback, useRef, useState } from 'react';
import { patchTicket } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

const INITIAL_STATE = { data: null, error: null, isLoading: false };

// 수리·점검 요청 처리(PATCH /tickets/:ticketId). 임대인은 status(IN_PROGRESS·DONE·CANCELED)·resolutionNote·cost를 바꾼다.
// 끝난 요청은 422 TICKET_READ_ONLY, 허용되지 않는 상태 변경은 422 TICKET_INVALID_TRANSITION.
// updateTicket()은 { data, error }를 돌려준다. 이미 요청 중이면 다시 보내지 않고 { data: null, error: null }.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const usePatchTicket = ({ onUnauthorized } = {}) => {
  const [state, setState] = useState(INITIAL_STATE);
  const pendingRef = useRef(false);

  const updateTicket = useCallback(
    async (ticketId, body) => {
      if (pendingRef.current) return { data: null, error: null };
      pendingRef.current = true;
      setState({ data: null, error: null, isLoading: true });

      try {
        const data = await patchTicket(ticketId, body);
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

  return { ...state, updateTicket, reset };
};
