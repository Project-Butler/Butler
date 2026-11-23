import { useCallback, useEffect, useState } from 'react';
import { getUnverifiedLogPromotePreview } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

// 인증 전 기록 올리기 미리보기(GET /property-ownerships/:ownershipId/management-logs/promote-preview, H-44).
// data = { count, items: [{ id, title, type, occurredOn }] }. ownershipId가 없으면 호출하지 않는다.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetUnverifiedLogPromotePreview = (ownershipId, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: Boolean(ownershipId) });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!ownershipId) {
      setState({ data: null, error: null, isLoading: false });
      return undefined;
    }

    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const data = await getUnverifiedLogPromotePreview(ownershipId);
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
  }, [ownershipId, reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, refetch };
};
