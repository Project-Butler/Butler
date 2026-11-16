import { useCallback, useEffect, useState } from 'react';
import { getTenantInvitationList } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

// 계약의 초대 발급 목록(A-07, 최신이 앞). 활성 소유자만 볼 수 있어 쓰는 쪽에서 필요할 때만 contractId를 넘긴다.
// data = [{ id, status, expiresAt, sharedDocumentCount, createdAt, inviteUrl: null }]. 401이면 onUnauthorized.
export const useGetTenantInvitationList = (contractId, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: Boolean(contractId) });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!contractId) {
      setState({ data: null, error: null, isLoading: false });
      return undefined;
    }
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const data = await getTenantInvitationList(contractId);
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
  }, [contractId, reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, refetch };
};
