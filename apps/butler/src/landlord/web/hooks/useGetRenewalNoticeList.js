import { useEffect, useState } from 'react';
import { getRenewalNoticeList } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

// 갱신 거절 통지 기록(GET /contracts/:contractId/renewal-notices, 최신순·페이지 없음). 타임라인의 계약 점(H-25)용.
// contractId가 없으면 호출하지 않는다. 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetRenewalNoticeList = (contractId, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: Boolean(contractId) });

  useEffect(() => {
    if (!contractId) {
      setState({ data: null, error: null, isLoading: false });
      return undefined;
    }
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const data = await getRenewalNoticeList(contractId);
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
  }, [contractId, onUnauthorized]);

  return state;
};
