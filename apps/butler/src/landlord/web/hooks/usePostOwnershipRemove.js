import { useCallback, useRef, useState } from 'react';
import { postOwnershipRemove } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

const INITIAL_STATE = { error: null, isLoading: false };

// 끝난 소유 관계 목록에서 지우기(POST /property-ownerships/:ownershipId/remove, H-41).
// remove(ownershipId)는 { ok, error }를 돌려준다. 이미 요청 중이면 다시 보내지 않고 { ok: false, error: null }.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const usePostOwnershipRemove = ({ onUnauthorized } = {}) => {
  const [state, setState] = useState(INITIAL_STATE);
  const pendingRef = useRef(false);

  const remove = useCallback(
    async (ownershipId) => {
      if (pendingRef.current) return { ok: false, error: null };
      pendingRef.current = true;
      setState({ error: null, isLoading: true });

      try {
        await postOwnershipRemove(ownershipId);
        setState(INITIAL_STATE);
        return { ok: true, error: null };
      } catch (error) {
        if (isUnauthorizedError(error)) {
          setState(INITIAL_STATE);
          onUnauthorized?.();
          return { ok: false, error: null };
        }
        const apiError = toApiError(error);
        setState({ error: apiError, isLoading: false });
        return { ok: false, error: apiError };
      } finally {
        pendingRef.current = false;
      }
    },
    [onUnauthorized],
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { ...state, remove, reset };
};
