import { useCallback, useEffect, useState } from 'react';
import { getDocumentList } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';
import { CONTRACT_DOCUMENT_PAGE_SIZE } from '../utils/tenantInvite';

// 계약 서류함(GET /documents?resourceType=CONTRACT&resourceId). data = 문서 배열(올린 순서).
// contractId가 없으면 호출하지 않는다. 401이면 onUnauthorized.
export const useGetContractDocumentList = (contractId, { onUnauthorized } = {}) => {
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
        const { data } = await getDocumentList({ resourceType: 'CONTRACT', resourceId: contractId, size: CONTRACT_DOCUMENT_PAGE_SIZE });
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
