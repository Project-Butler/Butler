import { useCallback, useEffect, useRef, useState } from 'react';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

const INITIAL_STATE = { data: null, error: null, isLoading: true, isLoadingMore: false };

// 커서 방식 목록(api-contract.md 1장 "목록 조회") 공용 hook. data = { items, meta: { nextCursor, hasNext } }.
// fetchPage(params)는 { data, meta }를 돌려주는 api-client 함수. params가 바뀌면 첫 쪽부터 다시 읽고,
// loadMore()는 nextCursor로 다음 쪽을 읽어 뒤에 이어 붙인다.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useCursorList = (fetchPage, params, { onUnauthorized } = {}) => {
  const [state, setState] = useState(INITIAL_STATE);
  const [reloadCount, setReloadCount] = useState(0);
  // params 객체가 렌더마다 새로 만들어져도 값이 같으면 다시 읽지 않는다.
  const paramsKey = JSON.stringify(params);
  // 필터를 바꾼 뒤 도착한 이전 조건의 "더 보기" 응답은 버린다.
  const requestKeyRef = useRef(paramsKey);

  useEffect(() => {
    let ignore = false;
    requestKeyRef.current = paramsKey;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const { data: items, meta } = await fetchPage(JSON.parse(paramsKey));
        if (!ignore) setState({ data: { items, meta }, error: null, isLoading: false, isLoadingMore: false });
      } catch (error) {
        if (ignore) return;
        if (isUnauthorizedError(error)) {
          onUnauthorized?.();
          return;
        }
        setState({ data: null, error: toApiError(error), isLoading: false, isLoadingMore: false });
      }
    };
    load();

    return () => {
      ignore = true;
    };
  }, [fetchPage, paramsKey, reloadCount, onUnauthorized]);

  const loadMore = useCallback(async () => {
    const cursor = state.data?.meta.nextCursor;
    if (!cursor || state.isLoadingMore) return;
    const requestKey = paramsKey;
    setState((prev) => ({ ...prev, error: null, isLoadingMore: true }));

    try {
      const { data: items, meta } = await fetchPage({ ...JSON.parse(paramsKey), cursor });
      if (requestKeyRef.current !== requestKey) return;
      setState((prev) => ({ ...prev, data: { items: [...prev.data.items, ...items], meta }, isLoadingMore: false }));
    } catch (error) {
      if (requestKeyRef.current !== requestKey) return;
      if (isUnauthorizedError(error)) {
        onUnauthorized?.();
        return;
      }
      setState((prev) => ({ ...prev, error: toApiError(error), isLoadingMore: false }));
    }
  }, [fetchPage, paramsKey, state.data, state.isLoadingMore, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  // 목록 한 줄을 바꿔 끼운다(재시도 후 상태 표시 등). 다시 읽지 않아도 화면이 맞게.
  const updateItem = useCallback((id, changes) => {
    setState((prev) =>
      prev.data
        ? { ...prev, data: { ...prev.data, items: prev.data.items.map((item) => (item.id === id ? { ...item, ...changes } : item)) } }
        : prev,
    );
  }, []);

  return { ...state, loadMore, refetch, updateItem };
};
