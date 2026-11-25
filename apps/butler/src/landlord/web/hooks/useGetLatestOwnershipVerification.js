import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getLatestOwnershipVerification, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';
import { isAttemptActive } from '../utils/ownershipVerification';

const POLL_INTERVAL_MS = 3000;

// 이 소유 관계의 내 최근 인증 시도(GET /ownership-verifications?ownershipId=). 진행 중이면 끝날 때까지 다시 읽는다.
// 화면을 나가면 폴링만 멈추고 인증은 서버에서 계속된다. 돌아오면 최근 시도를 다시 읽어 이어 보여 준다.
// trackAttempt(attempt): POST 응답을 넘겨 바로 추적한다. 진행 중이던 시도가 끝나면 onFinished(attempt)를 부른다.
// ownershipId가 없으면 호출하지 않는다. 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetLatestOwnershipVerification = (ownershipId, { onFinished, onUnauthorized } = {}) => {
  const queryClient = useQueryClient();
  const cacheKey = [queryKey.OWNERSHIP_VERIFICATION_LATEST, ownershipId];
  const wasActiveRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  const query = useApiQuery({
    queryKey: cacheKey,
    queryFn: () => getLatestOwnershipVerification(ownershipId),
    enabled: Boolean(ownershipId),
    // 진행 중이면 3초마다 다시 읽는다. 잠깐의 네트워크 오류가 나도 다음 차례에 다시 읽는다.
    refetchInterval: (current) => (isAttemptActive(current.state.data) ? POLL_INTERVAL_MS : false),
    onUnauthorized,
  });

  const attempt = query.data;
  const isActive = isAttemptActive(attempt);

  useEffect(() => {
    if (!attempt) return;
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isAttemptActive(attempt);
    if (wasActive && !wasActiveRef.current) onFinishedRef.current?.(attempt);
  }, [attempt]);

  const trackAttempt = useCallback(
    (next) => {
      wasActiveRef.current = true;
      queryClient.setQueryData([queryKey.OWNERSHIP_VERIFICATION_LATEST, ownershipId], next);
    },
    [queryClient, ownershipId],
  );

  return { data: query.data, error: query.error, isLoading: query.isLoading, isActive, trackAttempt };
};
