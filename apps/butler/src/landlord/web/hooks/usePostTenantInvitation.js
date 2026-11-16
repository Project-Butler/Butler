import { useCallback, useRef, useState } from 'react';
import { postTenantInvitation } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

const INITIAL_STATE = { data: null, error: null, isLoading: false };

// 초대 링크 만들기(A-06). 성공하면 data = { id, inviteUrl, expiresAt, status, sharedDocumentCount } (inviteUrl은 이때 한 번만).
// createInvitation()은 { data, error }를 돌려준다. 이미 요청 중이면 다시 보내지 않는다. 401이면 onUnauthorized.
export const usePostTenantInvitation = ({ onUnauthorized } = {}) => {
  const [state, setState] = useState(INITIAL_STATE);
  const pendingRef = useRef(false);

  const createInvitation = useCallback(
    async (contractId, body) => {
      if (pendingRef.current) return { data: null, error: null };
      pendingRef.current = true;
      setState({ data: null, error: null, isLoading: true });
      try {
        const data = await postTenantInvitation(contractId, body);
        setState({ data, error: null, isLoading: false });
        return { data, error: null };
      } catch (error) {
        if (isUnauthorizedError(error)) {
          setState(INITIAL_STATE);
          onUnauthorized?.();
          return { data: null, error: null };
        }
        const apiError = toApiError(error);
        setState({ data: null, error: apiError, isLoading: false });
        return { data: null, error: apiError };
      } finally {
        pendingRef.current = false;
      }
    },
    [onUnauthorized],
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { ...state, createInvitation, reset };
};
