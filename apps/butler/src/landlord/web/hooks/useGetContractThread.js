import { useEffect, useState } from 'react';
import { getThreadList } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

// 이 계약의 이미 있는 대화방(GET /threads?contextType=CONTRACT&contextId=). 없으면 data는 null.
// 새로 만들지 않고 찾기만 한다(끝난 계약에 빈 대화방이 생기지 않게). contractId가 없으면 호출하지 않는다.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetContractThread = (contractId, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: Boolean(contractId) });

  useEffect(() => {
    if (!contractId) {
      setState({ data: null, error: null, isLoading: false });
      return undefined;
    }

    let ignore = false;
    setState({ data: null, error: null, isLoading: true });

    const load = async () => {
      try {
        const { data } = await getThreadList({ contextType: 'CONTRACT', contextId: contractId, size: 1 });
        if (!ignore) setState({ data: data[0] ?? null, error: null, isLoading: false });
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
