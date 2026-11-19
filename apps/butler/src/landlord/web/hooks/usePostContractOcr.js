// Created: 2026-11-19
import { useCallback, useRef, useState } from 'react';
import { postContractOcr } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

const INITIAL_STATE = { data: null, error: null, isLoading: false };

// 계약서 OCR(POST /contract-ocr, B팀 #168). 성공하면 data = { fields, memoTruncated, warnings }.
// readContract()는 { data, error }를 돌려준다. 이미 요청 중이면 다시 보내지 않고 { data: null, error: null }.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const usePostContractOcr = ({ onUnauthorized } = {}) => {
  const [state, setState] = useState(INITIAL_STATE);
  const pendingRef = useRef(false);

  const readContract = useCallback(
    async ({ ownershipId, file }) => {
      if (pendingRef.current) return { data: null, error: null };
      pendingRef.current = true;
      setState({ data: null, error: null, isLoading: true });

      try {
        const data = await postContractOcr({ ownershipId, file });
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

  // 화면에서 미리 거른 오류(형식·크기)도 같은 자리에 보여 준다.
  const setLocalError = useCallback((message) => setState({ data: null, error: { message }, isLoading: false }), []);
  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { ...state, readContract, setLocalError, reset };
};
