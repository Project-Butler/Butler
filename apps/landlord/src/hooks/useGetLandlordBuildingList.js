import { useCallback, useEffect, useState } from 'react';
import { getLandlordBuildingList } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

// 내 건물 설정 목록(GET /landlord-buildings, 만든 순서). data = { items, meta: { page, size, total, hasNext } }.
// page가 1보다 크면 앞 페이지 결과 뒤에 이어 붙인다([더 보기]).
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
// refetch()는 같은 page를 다시 불러온다(오류가 난 페이지 재시도용).
// includeDeleted: 숨긴(삭제한) 건물 설정도 받는다(이름 표시용).
export const useGetLandlordBuildingList = ({ page = 1, size = 20, includeDeleted = false } = {}, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const { data: items, meta } = await getLandlordBuildingList(includeDeleted ? { page, size, includeDeleted } : { page, size });
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
  }, [page, size, includeDeleted, reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, refetch };
};
