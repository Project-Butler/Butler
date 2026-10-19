import { useCallback, useState } from 'react';
import { getComplexUnitInfo } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

const INITIAL_STATE = { data: null, error: null, isLoading: false };

// 동·호의 전용면적·층(GET /complexes/:complexId/unit-info). 건축물대장 기준.
// fetchUnitInfo()는 { data, error }를 돌려준다. 요청이 겹쳐도 막지 않는다 — 어느 응답을 쓸지는 부르는 쪽이 최신 키로 판단한다.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetComplexUnitInfo = ({ onUnauthorized } = {}) => {
  const [state, setState] = useState(INITIAL_STATE);

  const fetchUnitInfo = useCallback(
    async (complexId, params) => {
      setState({ data: null, error: null, isLoading: true });

      try {
        const data = await getComplexUnitInfo(complexId, params);
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
      }
    },
    [onUnauthorized],
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { ...state, fetchUnitInfo, reset };
};
