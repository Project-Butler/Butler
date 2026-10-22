import { useCallback, useEffect, useState } from 'react';
import { getPropertyList } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

// 내 호실 목록(GET /properties). complexId를 주면 그 단지(건물)의 호실만. data = { items, meta: { page, size, total, hasNext } }.
// page가 1보다 크면 앞 페이지 결과 뒤에 이어 붙인다([더 보기]). relation이 바뀌면 쓰는 쪽에서 page를 1로 되돌린다.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
// refetch()는 같은 page를 다시 불러온다(오류가 난 페이지 재시도용).
export const useGetPropertyList = ({ relation = 'OWNER', complexId, page = 1, size = 20 } = {}, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const { data: items, meta } = await getPropertyList({ relation, complexId, page, size });
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
  }, [relation, complexId, page, size, reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, refetch };
};
