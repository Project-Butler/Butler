import { useCallback, useEffect, useState } from 'react';
import { deleteRenewalNotice, getRenewalNoticeList, postRenewalNotice } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

// 계약의 갱신 거절 통지 기록(GET·POST·DELETE /contracts/:id/renewal-notices). enabled 일 때만 불러온다(시트를 열 때).
// create(body)·remove(id)는 성공하면 목록을 다시 불러오고 onChanged()를 부른다(계약 응답의 renewalNotice 요약을 새로 받게).
// 실패하면 오류(toApiError 모양)를 돌려주고, 성공·401이면 null 을 돌려준다(throw 하지 않는다).
export const useRenewalNotices = (contractId, { enabled = true, onChanged, onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: enabled });
  const [reloadCount, setReloadCount] = useState(0);
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    if (!enabled || !contractId) return undefined;
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
        setState((prev) => ({ ...prev, error: toApiError(error), isLoading: false }));
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [contractId, enabled, reloadCount, onUnauthorized]);

  const run = useCallback(
    async (action) => {
      setIsMutating(true);
      try {
        await action();
        setReloadCount((count) => count + 1);
        onChanged?.();
        return null;
      } catch (error) {
        if (isUnauthorizedError(error)) {
          onUnauthorized?.();
          return null;
        }
        return toApiError(error);
      } finally {
        setIsMutating(false);
      }
    },
    [onChanged, onUnauthorized],
  );

  const create = useCallback((body) => run(() => postRenewalNotice(contractId, body)), [contractId, run]);
  const remove = useCallback((noticeId) => run(() => deleteRenewalNotice(contractId, noticeId)), [contractId, run]);

  return { ...state, isMutating, create, remove };
};
