import { useCallback, useEffect, useState } from 'react';
import { isUnauthorizedError, toApiError } from '../../shared/apiError';

// 화면 하나가 쓰는 조회 하나(shared/useGetContract 와 같은 모양). key 가 null 이면 부르지 않는다.
// 401 이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useLoad = (key, load, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: key !== null });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (key === null) {
      setState({ data: null, error: null, isLoading: false });
      return undefined;
    }
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));
    load()
      .then((data) => {
        if (!ignore) setState({ data, error: null, isLoading: false });
      })
      .catch((error) => {
        if (ignore) return;
        if (isUnauthorizedError(error)) {
          onUnauthorized?.();
          return;
        }
        setState({ data: null, error: toApiError(error), isLoading: false });
      });
    return () => {
      ignore = true;
    };
    // load 는 key 로 대신 본다(호출부가 매 렌더 새 함수를 넘겨도 다시 부르지 않게).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);
  return { ...state, refetch };
};
