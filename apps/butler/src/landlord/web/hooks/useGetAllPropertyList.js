import { useCallback, useEffect, useState } from 'react';
import { getPropertyList } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

const PAGE_SIZE = 100; // 서버 요청 검증의 최대 size

// 관계(OWNER·FORMER_OWNER)별 호실 전체. 한 페이지(100개)씩 hasNext가 끝날 때까지 이어 받는다.
// data = 호실 배열(항목마다 documentCount). 401이면 onUnauthorized. refetch()는 지금 데이터를 둔 채 다시 받는다.
export const useGetAllPropertyList = (relation, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const items = [];
        for (let page = 1; ; page += 1) {
          const { data, meta } = await getPropertyList({ relation, page, size: PAGE_SIZE });
          items.push(...data);
          if (!meta.hasNext) break;
        }
        if (!ignore) setState({ data: items, error: null, isLoading: false });
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
  }, [relation, reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, refetch };
};
