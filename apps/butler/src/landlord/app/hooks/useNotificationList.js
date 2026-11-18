import { useCallback, useEffect, useState } from 'react';
import { getNotificationList, postNotificationRead, postNotificationReadAll } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

const PAGE_SIZE = 30;

// 내 알림 목록(GET /notifications, 커서 방식, 최신순). loadMore()로 다음 묶음을 뒤에 붙인다.
// markRead(id)·markAllRead()는 화면의 readAt 을 먼저 채우고 저장한다(실패해도 목록은 그대로 두고 actionError 만 채운다).
// unreadCount 는 서버 수(initialUnreadCount)에서 이 화면에서 읽은 만큼 뺀 값이다(불러오지 않은 알림도 센다).
export const useNotificationList = ({ initialUnreadCount = 0, onUnauthorized } = {}) => {
  const [state, setState] = useState({ items: null, nextCursor: null, hasNext: false, error: null, isLoading: true });
  const [cursor, setCursor] = useState(null);
  const [readDelta, setReadDelta] = useState(0);
  const [allRead, setAllRead] = useState(false);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));
    const load = async () => {
      try {
        const { data, meta } = await getNotificationList({ size: PAGE_SIZE, cursor: cursor ?? undefined });
        if (ignore) return;
        setState((prev) => ({
          items: cursor && prev.items ? [...prev.items, ...data] : data,
          nextCursor: meta?.nextCursor ?? null,
          hasNext: Boolean(meta?.hasNext),
          error: null,
          isLoading: false,
        }));
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
  }, [cursor, onUnauthorized]);

  const loadMore = useCallback(() => {
    if (state.hasNext && state.nextCursor) setCursor(state.nextCursor);
  }, [state.hasNext, state.nextCursor]);

  const handleActionError = useCallback(
    (error) => {
      if (isUnauthorizedError(error)) onUnauthorized?.();
      else setActionError(toApiError(error));
    },
    [onUnauthorized],
  );

  const markRead = useCallback(
    async (notificationId) => {
      const target = state.items?.find((item) => item.id === notificationId);
      if (!target || target.readAt) return;
      const readAt = new Date().toISOString();
      setState((prev) => ({ ...prev, items: prev.items.map((item) => (item.id === notificationId ? { ...item, readAt } : item)) }));
      setReadDelta((delta) => delta + 1);
      setActionError(null);
      try {
        await postNotificationRead(notificationId);
      } catch (error) {
        handleActionError(error);
      }
    },
    [handleActionError, state.items],
  );

  const markAllRead = useCallback(async () => {
    const readAt = new Date().toISOString();
    setState((prev) => ({ ...prev, items: prev.items ? prev.items.map((item) => (item.readAt ? item : { ...item, readAt })) : prev.items }));
    setAllRead(true);
    setActionError(null);
    try {
      await postNotificationReadAll();
    } catch (error) {
      handleActionError(error);
    }
  }, [handleActionError]);

  const unreadCount = allRead ? 0 : Math.max(initialUnreadCount - readDelta, 0);

  return { ...state, unreadCount, actionError, loadMore, markRead, markAllRead };
};
