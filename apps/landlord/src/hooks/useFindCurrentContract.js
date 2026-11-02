import { useCallback, useRef, useState } from 'react';
import { getContractList } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

const INITIAL_STATE = { data: null, error: null, isLoading: false };

// 호실의 지금 계약(진행 중 → 시작 전, 종료일 가까운 것 하나)을 누를 때 한 번만 찾는다(S-07, 행마다 미리 조회하지 않음).
// findContract(propertyId)는 { data, error }를 돌려준다. 계약이 없으면 data = null, error = null.
// 이미 요청 중이면 다시 보내지 않는다. 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useFindCurrentContract = ({ onUnauthorized } = {}) => {
  const [state, setState] = useState(INITIAL_STATE);
  const pendingRef = useRef(false);

  const findContract = useCallback(
    async (propertyId) => {
      if (pendingRef.current) return { data: null, error: null };
      pendingRef.current = true;
      setState({ data: null, error: null, isLoading: true });

      try {
        const { data: items } = await getContractList({
          propertyId,
          status: 'ACTIVE,EXPIRING_SOON,UPCOMING',
          sort: 'endDate:asc',
          size: 1,
        });
        const data = items[0] ?? null;
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

  return { ...state, findContract };
};
