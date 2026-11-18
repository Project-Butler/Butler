import { useCallback, useEffect, useState } from 'react';
import { getTicket } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

// 수리·점검 요청 상세(GET /tickets/:ticketId). 볼 수 없으면 404 TICKET_NOT_FOUND가 error로 온다.
// 처리 상태를 바꾼 뒤에는 setData로 응답을 바로 반영한다(다시 불러오지 않는다).
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetTicket = (ticketId, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: Boolean(ticketId) });

  useEffect(() => {
    if (!ticketId) return undefined;
    let ignore = false;
    setState({ data: null, error: null, isLoading: true });

    const load = async () => {
      try {
        const data = await getTicket(ticketId);
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
  }, [ticketId, onUnauthorized]);

  const setData = useCallback((data) => setState({ data, error: null, isLoading: false }), []);

  return { ...state, setData };
};
