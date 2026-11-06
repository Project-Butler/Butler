import { useEffect, useState } from 'react';
import { getPropertyOwnershipList } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

// 내 소유 관계 목록(GET /property-ownerships). data = { items, meta: { page, size, total, hasNext } }.
// active: 'true'(활성만) · 'false'(종료만) · 생략(전체).
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetPropertyOwnershipList = ({ active, page = 1, size = 20 } = {}, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });

  useEffect(() => {
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const { data: items, meta } = await getPropertyOwnershipList({ active, page, size });
        if (!ignore) setState({ data: { items, meta }, error: null, isLoading: false });
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
  }, [active, page, size, onUnauthorized]);

  return state;
};
