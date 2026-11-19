// Created: 2026-11-19
import { useCallback, useEffect, useRef, useState } from 'react';
import { getInProgressOwnershipVerificationList, getOwnershipVerification } from '@butler/api-client';
import { isUnauthorizedError } from '../../../shared/apiError';

// 진행 중이 있으면 자주, 없으면 드물게 확인한다. 화면을 옮길 때도 다시 읽는다(인증 시작 직후 바로 보이게).
const ACTIVE_POLL_MS = 5000;
const IDLE_POLL_MS = 30000;

// 화면 오른쪽 아래 권리자 인증 진행 표시용(GET /ownership-verifications/in-progress).
// running: 진행 중 시도 [{ id, ownershipId, status, property: { id, displayName } }]
// finished: 진행 중이었다가 끝난 시도 [{ attempt, property }] — dismiss(id)로 닫을 때까지 남는다.
// refreshKey가 바뀌면 바로 다시 읽는다. 401이면 onUnauthorized.
export const useInProgressOwnershipVerifications = ({ refreshKey, onUnauthorized } = {}) => {
  const [serverItems, setServerItems] = useState([]);
  const [finished, setFinished] = useState([]);
  const previousRef = useRef(new Map());

  const running = serverItems;

  // 목록 읽기: 처음 · refreshKey 변경 · 주기. 잠깐의 오류는 다음 차례에 다시 읽는다.
  const hasRunning = serverItems.length > 0;
  useEffect(() => {
    let ignore = false;
    let timer;
    const load = async () => {
      try {
        const items = await getInProgressOwnershipVerificationList();
        if (!ignore) setServerItems(items);
      } catch (error) {
        if (ignore) return;
        if (isUnauthorizedError(error)) {
          onUnauthorized?.();
          return;
        }
      }
      if (!ignore) timer = setTimeout(load, hasRunning ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };
    load();
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [refreshKey, hasRunning, onUnauthorized]);

  // 목록에서 빠진 시도 = 끝난 시도. 결과(VERIFIED · FAILED)를 읽어 finished에 넣는다.
  const runningKey = running.map((item) => item.id).join(',');
  useEffect(() => {
    const previous = previousRef.current;
    const current = new Map(running.map((item) => [item.id, item]));
    previousRef.current = current;

    for (const [id, item] of previous) {
      if (current.has(id)) continue;
      const settle = async () => {
        let attempt;
        try {
          attempt = await getOwnershipVerification(id);
        } catch {
          return;
        }
        if (!attempt || attempt.status === 'PENDING' || attempt.status === 'RUNNING') return;
        setFinished((prev) => [...prev.filter((entry) => entry.attempt.id !== id), { attempt, property: item.property }]);
      };
      settle();
    }
    // runningKey로 목록이 바뀔 때만 비교한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningKey]);

  // 다시 진행 중이 되면(같은 호실 재시도 · 리모컨) 끝난 표시를 지운다.
  useEffect(() => {
    setFinished((prev) => {
      const next = prev.filter((entry) => !running.some((item) => item.ownershipId === entry.attempt.ownershipId));
      return next.length === prev.length ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningKey]);

  const dismiss = useCallback((attemptId) => setFinished((prev) => prev.filter((entry) => entry.attempt.id !== attemptId)), []);

  return { running, finished, dismiss };
};
