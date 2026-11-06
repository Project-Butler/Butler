import { useCallback, useEffect, useRef, useState } from 'react';
import { getLatestOwnershipVerification } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';
import { isAttemptActive } from '../utils/ownershipVerification';

const POLL_INTERVAL_MS = 3000;

// 이 소유 관계의 내 최근 인증 시도(GET /ownership-verifications?ownershipId=). 진행 중이면 끝날 때까지 다시 읽는다.
// 화면을 나가면 폴링만 멈추고 인증은 서버에서 계속된다. 돌아오면 최근 시도를 다시 읽어 이어 보여 준다.
// trackAttempt(attempt): POST 응답을 넘겨 바로 추적한다. 진행 중이던 시도가 끝나면 onFinished(attempt)를 부른다.
// ownershipId가 없으면 호출하지 않는다. 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetLatestOwnershipVerification = (ownershipId, { onFinished, onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: Boolean(ownershipId) });
  const wasActiveRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (!ownershipId) {
      setState({ data: null, error: null, isLoading: false });
      return undefined;
    }

    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const data = await getLatestOwnershipVerification(ownershipId);
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
  }, [ownershipId, onUnauthorized]);

  const attempt = state.data;
  const isActive = isAttemptActive(attempt);

  useEffect(() => {
    if (!ownershipId || !isActive) return undefined;

    let ignore = false;
    let timer;
    const poll = async () => {
      try {
        const data = await getLatestOwnershipVerification(ownershipId);
        if (ignore) return;
        setState({ data, error: null, isLoading: false });
      } catch (error) {
        if (ignore) return;
        if (isUnauthorizedError(error)) {
          onUnauthorized?.();
          return;
        }
        // 잠깐의 네트워크 오류로 추적을 놓치지 않게 다음 차례에 다시 읽는다.
        setState((prev) => ({ ...prev, error: toApiError(error) }));
      }
      if (!ignore) timer = setTimeout(poll, POLL_INTERVAL_MS);
    };
    timer = setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [ownershipId, isActive, onUnauthorized]);

  useEffect(() => {
    if (!attempt) return;
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isAttemptActive(attempt);
    if (wasActive && !wasActiveRef.current) onFinishedRef.current?.(attempt);
  }, [attempt]);

  const trackAttempt = useCallback((next) => {
    wasActiveRef.current = true;
    setState({ data: next, error: null, isLoading: false });
  }, []);

  return { ...state, isActive, trackAttempt };
};
