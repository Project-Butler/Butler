import { useCallback, useEffect, useState } from 'react';
import { getAdminUserList } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../shared/apiError';

// 회원 목록(GET /admin/users). data = { items, meta: { page, size, total, hasNext } }.
// 쪽 번호로 넘기는 표라서 앞 쪽 결과에 이어 붙이지 않고 바꿔 끼운다. 다시 불러오는 동안 이전 쪽을 그대로 보여 준다.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetAdminUserList = ({ query, role, status, page = 1, size = 20 } = {}, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const { data: items, meta } = await getAdminUserList({ query, role, status, page, size });
        if (!ignore) setState({ data: { items, meta }, error: null, isLoading: false });
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
  }, [query, role, status, page, size, reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, refetch };
};
