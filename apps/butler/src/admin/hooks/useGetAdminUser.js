import { useCallback, useEffect, useState } from 'react';
import { getAdminUser } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

// 회원 상세(GET /admin/users/:userId). 소유 관계 요약(ownerships)이 같이 온다.
// userId가 없으면 호출하지 않는다. 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
// setData()는 상태 변경 응답으로 화면을 바로 고칠 때 쓴다(소유 관계는 그대로 둔다).
export const useGetAdminUser = (userId, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: Boolean(userId) });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setState({ data: null, error: null, isLoading: false });
      return undefined;
    }

    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const data = await getAdminUser(userId);
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
  }, [userId, reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);
  const setData = useCallback((patch) => setState((prev) => ({ ...prev, data: prev.data && { ...prev.data, ...patch } })), []);

  return { ...state, refetch, setData };
};
