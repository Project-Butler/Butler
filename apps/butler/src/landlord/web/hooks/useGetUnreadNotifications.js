import { useCallback, useEffect, useState } from 'react';
import { getNotificationList, postNotificationRead } from '@butler/api-client';
import { isUnauthorizedError } from '../../../shared/apiError';

const SIZE = 20;

// PC 위 막대 종에 띄울 안 읽은 알림(GET /notifications?unreadOnly=true, 최신 20개). 실패하면 빈 목록(종만 조용해진다).
// markRead(id): 화면에서 먼저 빼고 저장한다(실패해도 다음 refetch 때 다시 보인다). 401이면 onUnauthorized.
export const useGetUnreadNotifications = ({ onUnauthorized } = {}) => {
  const [items, setItems] = useState([]);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const { data } = await getNotificationList({ size: SIZE, unreadOnly: true });
        if (!ignore) setItems(data ?? []);
      } catch (error) {
        if (!ignore && isUnauthorizedError(error)) onUnauthorized?.();
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [reloadCount, onUnauthorized]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);
  const markRead = useCallback(
    async (notificationId) => {
      setItems((prev) => prev.filter((item) => item.id !== notificationId));
      try {
        await postNotificationRead(notificationId);
      } catch (error) {
        if (isUnauthorizedError(error)) onUnauthorized?.();
      }
    },
    [onUnauthorized],
  );

  return { items, refetch, markRead };
};
