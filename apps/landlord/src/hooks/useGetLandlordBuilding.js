import { useCallback, useEffect, useState } from 'react';
import { getLandlordBuilding } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

// 건물 설정 하나(GET /landlord-buildings/:landlordBuildingId). landlordBuildingId가 없으면 호출하지 않는다.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetLandlordBuilding = (landlordBuildingId, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: Boolean(landlordBuildingId) });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!landlordBuildingId) {
      setState({ data: null, error: null, isLoading: false });
      return undefined;
    }

    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const data = await getLandlordBuilding(landlordBuildingId);
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
  }, [landlordBuildingId, reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, refetch };
};
