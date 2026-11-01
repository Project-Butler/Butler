import { useCallback, useEffect, useState } from 'react';
import { getAdminAuditLogList } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

// 감사 로그 최근 순 첫 쪽(GET /admin/audit-logs). data = { items, meta: { nextCursor, hasNext } }.
// 대시보드 "최근 활동 로그"가 쓴다. 다음 쪽 넘기기(cursor)는 감사 로그 화면(3단계)에서 붙인다.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetAdminAuditLogList = ({ size = 30 } = {}, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const { data: items, meta } = await getAdminAuditLogList({ size });
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
  }, [size, reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, refetch };
};
