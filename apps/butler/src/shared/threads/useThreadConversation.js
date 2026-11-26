import { useCallback, useEffect, useRef, useState } from 'react';
import { getThread, getThreadMessageList, postThreadMessage, postThreadRead } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../apiError';
import { useInvalidateThreadList } from './useInvalidateThreadList';

const PAGE_SIZE = 30;
// 새 메시지를 한 번에 받는 최대 개수(서버 최대). 더 있으면(hasNext) 이어서 받는다.
const POLL_PAGE_SIZE = 100;
const MAX_POLL_ROUNDS = 5;
export const THREAD_POLL_INTERVAL_MS = 10_000;

// 이미 있는 메시지는 빼고 붙인다(보낸 직후 폴링과 겹칠 수 있다).
const appendUnique = (current, incoming) => {
  const seen = new Set(current.map((message) => message.id));
  return [...current, ...incoming.filter((message) => !seen.has(message.id))];
};

// 글만이면 지금처럼 { body }, 첨부가 있으면 attachmentDocumentIds 를 같이 보낸다(첨부만이면 body 는 빈 글).
const toMessageBody = (input) => {
  if (typeof input === 'string') return { body: input };
  const attachmentDocumentIds = input?.attachmentDocumentIds ?? [];
  const body = input?.body ?? '';
  return attachmentDocumentIds.length > 0 ? { body, attachmentDocumentIds } : { body };
};

// 대화방 한 개(GET /threads/:id + 메시지). 메시지는 오래된 것 → 최신 순(화면 위 → 아래)으로 둔다.
// - 처음: 최신 30개(cursor 방식은 최신순이라 뒤집는다). [이전 메시지 더 보기]는 nextCursor 로 앞에 붙인다.
// - 새 메시지: 10초마다 after(마지막 메시지 id)로 받는다. 창이 가려져 있으면 건너뛴다.
// - 읽음: 마지막 메시지가 바뀌면 POST /threads/:id/read 로 읽은 위치를 옮긴다(실패해도 화면은 그대로).
// - 보낸 뒤·읽은 뒤에는 대화 목록(안 읽은 수)을 새로 받게 한다(QueryClientProvider 안에서만 쓴다).
// - isActive(기본 true): false 면(PC 팝업을 접은 동안) 폴링·읽음을 멈춘다. 처음 불러오기는 한다.
//   false → true 로 바뀌면 그때만 곧바로 한 번 받고 읽음까지 옮긴다. 처음부터 true 면 첫 폴링은 지금처럼 간격 뒤.
// sendMessage(input): 글(문자열) 또는 { body, attachmentDocumentIds }. 성공하면 true.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useThreadConversation = (threadId, { onUnauthorized, pollIntervalMs = THREAD_POLL_INTERVAL_MS, isActive = true } = {}) => {
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [older, setOlder] = useState({ cursor: null, hasNext: false, isLoading: false, error: null });
  const [error, setError] = useState(null);
  const [send, setSend] = useState({ isSending: false, error: null });
  const lastIdRef = useRef(null);
  const sendingRef = useRef(false);
  const lastReadRef = useRef(null);
  const wasActiveRef = useRef(isActive);
  // 펼친 직후 따라잡기 폴링 중에는 읽음을 미뤘다가, 끝나면 마지막 메시지까지 한 번만 보낸다.
  const catchingUpRef = useRef(null);
  // 진행 중인 폴링(effect 가 다시 돌아도 겹쳐 돌지 않게 훅 단위로 하나만 둔다)
  const inflightRef = useRef(null);
  const [catchUpRound, setCatchUpRound] = useState(0);
  const invalidateThreadList = useInvalidateThreadList();

  const handleError = useCallback(
    (requestError) => {
      if (isUnauthorizedError(requestError)) {
        onUnauthorized?.();
        return null;
      }
      return toApiError(requestError);
    },
    [onUnauthorized],
  );

  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    lastIdRef.current = lastMessageId;
  }, [lastMessageId]);

  // 처음 불러오기
  useEffect(() => {
    let ignore = false;
    setThread(null);
    setMessages([]);
    setError(null);

    const load = async () => {
      try {
        const [threadData, page] = await Promise.all([getThread(threadId), getThreadMessageList(threadId, { size: PAGE_SIZE })]);
        if (ignore) return;
        setThread(threadData);
        setMessages([...page.data].reverse());
        setOlder({ cursor: page.meta.nextCursor, hasNext: page.meta.hasNext, isLoading: false, error: null });
      } catch (requestError) {
        if (ignore) return;
        const apiError = handleError(requestError);
        if (apiError) setError(apiError);
      }
    };
    load();

    return () => {
      ignore = true;
    };
  }, [threadId, handleError]);

  // 새 메시지 폴링(isActive 일 때만)
  useEffect(() => {
    if (!thread || !isActive) return undefined;
    const becameActive = !wasActiveRef.current;
    let ignore = false;

    const run = async () => {
      try {
        // 아직 메시지가 없는 대화면 after 기준이 없으므로 최신 페이지를 받는다.
        if (!lastIdRef.current) {
          const page = await getThreadMessageList(threadId, { size: PAGE_SIZE });
          if (ignore || page.data.length === 0) return;
          lastIdRef.current = page.data[0].id;
          setMessages((prev) => appendUnique(prev, [...page.data].reverse()));
          return;
        }
        for (let round = 0; round < MAX_POLL_ROUNDS; round += 1) {
          const page = await getThreadMessageList(threadId, { after: lastIdRef.current, size: POLL_PAGE_SIZE });
          if (ignore || page.data.length === 0) break;
          lastIdRef.current = page.data[page.data.length - 1].id;
          setMessages((prev) => appendUnique(prev, page.data));
          if (!page.meta.hasNext) break;
        }
      } catch (requestError) {
        // 폴링 실패는 다음 차례에 다시 시도한다. 로그인이 풀린 경우만 알린다.
        if (!ignore && isUnauthorizedError(requestError)) onUnauthorized?.();
      }
    };
    // 이미 받는 중이면 그 요청을 같이 기다린다(새로 보내지 않는다).
    const poll = () => {
      if (document.hidden) return Promise.resolve();
      if (!inflightRef.current) {
        inflightRef.current = run().finally(() => {
          inflightRef.current = null;
        });
      }
      return inflightRef.current;
    };

    const timer = setInterval(poll, pollIntervalMs);
    // 접혀 있다가 펼쳐진 때만 기다리지 않고 바로 받는다(그동안 읽음은 미룬다).
    // 빠르게 접었다 펼쳐도 마지막 따라잡기만 표시를 지우게 토큰으로 구분한다.
    if (becameActive) {
      const token = {};
      catchingUpRef.current = token;
      poll().finally(() => {
        if (catchingUpRef.current !== token) return;
        catchingUpRef.current = null;
        if (!ignore) setCatchUpRound((round) => round + 1);
      });
    }
    return () => {
      ignore = true;
      catchingUpRef.current = null;
      clearInterval(timer);
    };
  }, [thread, threadId, pollIntervalMs, onUnauthorized, isActive]);

  // 지난 isActive 값(위 폴링 effect 가 "펼쳐진 순간"을 알 수 있게, 그 뒤에 갱신한다)
  useEffect(() => {
    wasActiveRef.current = isActive;
  }, [isActive]);

  // 읽음 표시(isActive 일 때만)
  useEffect(() => {
    if (!thread || !isActive || catchingUpRef.current || !lastMessageId || lastReadRef.current === lastMessageId) return;
    lastReadRef.current = lastMessageId;
    postThreadRead(threadId, lastMessageId)
      .then(() => invalidateThreadList())
      .catch((requestError) => {
        if (isUnauthorizedError(requestError)) onUnauthorized?.();
      });
  }, [thread, threadId, lastMessageId, onUnauthorized, isActive, invalidateThreadList, catchUpRound]);

  const loadOlder = useCallback(async () => {
    if (!older.hasNext || older.isLoading) return;
    setOlder((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const page = await getThreadMessageList(threadId, { cursor: older.cursor, size: PAGE_SIZE });
      setMessages((prev) => {
        const seen = new Set(prev.map((message) => message.id));
        return [...[...page.data].reverse().filter((message) => !seen.has(message.id)), ...prev];
      });
      setOlder({ cursor: page.meta.nextCursor, hasNext: page.meta.hasNext, isLoading: false, error: null });
    } catch (requestError) {
      const apiError = handleError(requestError);
      setOlder((prev) => ({ ...prev, isLoading: false, error: apiError }));
    }
  }, [threadId, older, handleError]);

  // 보내기. 성공하면 true. 이미 보내는 중이면 다시 보내지 않는다.
  const sendMessage = useCallback(
    async (input) => {
      if (sendingRef.current) return false;
      sendingRef.current = true;
      setSend({ isSending: true, error: null });
      try {
        const message = await postThreadMessage(threadId, toMessageBody(input));
        setMessages((prev) => appendUnique(prev, [message]));
        setSend({ isSending: false, error: null });
        invalidateThreadList();
        return true;
      } catch (requestError) {
        const apiError = handleError(requestError);
        // 끝난 계약·요청이면 그 자리에서 읽기 전용으로 바꾼다.
        if (apiError?.code === 'THREAD_READ_ONLY') setThread((prev) => (prev ? { ...prev, isReadOnly: true } : prev));
        setSend({ isSending: false, error: apiError });
        return false;
      } finally {
        sendingRef.current = false;
      }
    },
    [threadId, handleError, invalidateThreadList],
  );

  return {
    thread,
    messages,
    error,
    isLoading: !thread && !error,
    hasOlder: older.hasNext,
    isLoadingOlder: older.isLoading,
    olderError: older.error,
    loadOlder,
    sendMessage,
    isSending: send.isSending,
    sendError: send.error,
  };
};
