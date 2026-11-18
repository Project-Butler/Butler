import { useEffect, useState } from 'react';
import { getScheduleList } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

// 일정 목록(GET /schedules). fromDate~toDate(양끝 포함, 최대 93일). data = 일정 배열(날짜순).
// 둘 중 하나라도 없으면 부르지 않는다. 401이면 오류 대신 onUnauthorized 를 부른다.
export const useGetScheduleList = ({ fromDate, toDate }, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: Boolean(fromDate && toDate) });

  useEffect(() => {
    if (!fromDate || !toDate) return undefined;
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const items = await getScheduleList({ fromDate, toDate });
        if (!ignore) setState({ data: items, error: null, isLoading: false });
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
  }, [fromDate, toDate, onUnauthorized]);

  return state;
};
