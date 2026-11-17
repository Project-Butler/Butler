import { useCallback, useEffect, useRef, useState } from 'react';
import { getPropertyDocumentBox } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

// 호실 하나의 문서함(GET /properties/:propertyId/documents). data = { property, documentCount, ownerships, contracts }.
// propertyId가 없으면 호출하지 않는다. 호실이 바뀌면 앞 호실 데이터를 지우고, refetch()는 지금 데이터를 둔 채 다시 받는다. 401이면 onUnauthorized.
export const useGetPropertyDocumentBox = (propertyId, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: Boolean(propertyId) });
  const [reloadCount, setReloadCount] = useState(0);
  const loadedIdRef = useRef(propertyId);

  useEffect(() => {
    if (!propertyId) {
      setState({ data: null, error: null, isLoading: false });
      return undefined;
    }
    let ignore = false;
    const isSameProperty = loadedIdRef.current === propertyId;
    loadedIdRef.current = propertyId;
    setState((prev) => ({ data: isSameProperty ? prev.data : null, error: null, isLoading: true }));

    const load = async () => {
      try {
        const data = await getPropertyDocumentBox(propertyId);
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
  }, [propertyId, reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, refetch };
};
