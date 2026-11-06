import { useCallback, useEffect, useState } from 'react';
import { getManagementLogList } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

// 관리 로그 목록(GET /management-logs). type은 'REPAIR,NOTE'처럼 쉼표로. data = { items, meta: { page, size, total, hasNext } }.
// page가 1보다 크면 앞 페이지 결과 뒤에 이어 붙인다([더 보기]). 필터가 바뀌면 쓰는 쪽에서 page를 1로 되돌린다.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetManagementLogList = ({ propertyId, type, until, page = 1, size = 20 } = {}, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const { data: items, meta } = await getManagementLogList({ propertyId, type, until, page, size });
        if (ignore) return;
        setState((prev) => ({
          data: { items: page > 1 && prev.data ? [...prev.data.items, ...items] : items, meta },
          error: null,
          isLoading: false,
        }));
      } catch (error) {
        if (ignore) return;
        if (isUnauthorizedError(error)) {
          onUnauthorized?.();
          return;
        }
        setState((prev) => ({ ...prev, error: toApiError(error), isLoading: false }));
      }
    };
    load();

    return () => {
      ignore = true;
    };
  }, [propertyId, type, until, page, size, reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, refetch };
};
