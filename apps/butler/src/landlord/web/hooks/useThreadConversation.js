import { useCallback, useEffect, useRef, useState } from 'react';
import { getThread, getThreadMessageList, postThreadMessage, postThreadRead } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

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

// 대화방 한 개(GET /threads/:id + 메시지). 메시지는 오래된 것 → 최신 순(화면 위 → 아래)으로 둔다.
// - 처음: 최신 30개(cursor 방식은 최신순이라 뒤집는다). [이전 메시지 더 보기]는 nextCursor 로 앞에 붙인다.
// - 새 메시지: 10초마다 after(마지막 메시지 id)로 받는다. 창이 가려져 있으면 건너뛴다.
// - 읽음: 마지막 메시지가 바뀌면 POST /threads/:id/read 로 읽은 위치를 옮긴다(실패해도 화면은 그대로).
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useThreadConversation = (threadId, { onUnauthorized, pollIntervalMs = THREAD_POLL_INTERVAL_MS } = {}) => {
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [older, setOlder] = useState({ cursor: null, hasNext: false, isLoading: false, error: null });
  const [error, setError] = useState(null);
  const [send, setSend] = useState({ isSending: false, error: null });
  const lastIdRef = useRef(null);
  const sendingRef = useRef(false);
  const lastReadRef = useRef(null);

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

  // 새 메시지 폴링
  useEffect(() => {
    if (!thread) return undefined;
    let ignore = false;
    let running = false;

    const poll = async () => {
      if (running || document.hidden) return;
      running = true;
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
      } finally {
        running = false;
      }
    };

    const timer = setInterval(poll, pollIntervalMs);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [thread, threadId, pollIntervalMs, onUnauthorized]);

  // 읽음 표시
  useEffect(() => {
    if (!thread || !lastMessageId || lastReadRef.current === lastMessageId) return;
    lastReadRef.current = lastMessageId;
    postThreadRead(threadId, lastMessageId).catch((requestError) => {
      if (isUnauthorizedError(requestError)) onUnauthorized?.();
    });
  }, [thread, threadId, lastMessageId, onUnauthorized]);

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
    async (body) => {
      if (sendingRef.current) return false;
      sendingRef.current = true;
      setSend({ isSending: true, error: null });
      try {
        const message = await postThreadMessage(threadId, { body });
        setMessages((prev) => appendUnique(prev, [message]));
        setSend({ isSending: false, error: null });
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
    [threadId, handleError],
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
