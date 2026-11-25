import { useCallback, useEffect, useRef, useState } from 'react';
import { getNotificationList, postNotificationRead } from '@butler/api-client';
import { isUnauthorizedError } from '../../../shared/apiError';

const SIZE = 20;

// PC 위 막대 종에 띄울 안 읽은 알림(GET /notifications?unreadOnly=true, 최신 20개). 실패하면 빈 목록(종만 조용해진다).
// markRead(id): 화면에서 먼저 빼고 저장한다. 저장보다 다시 불러오기가 먼저 끝나도 다시 보이지 않게, 이 화면에서 읽은 id 는 기억해서 거른다.
// 저장이 실패하면 기억에서 지워 다음 refetch 때 다시 보이게 한다. 401이면 onUnauthorized.
export const useGetUnreadNotifications = ({ onUnauthorized } = {}) => {
  const [items, setItems] = useState([]);
  const [reloadCount, setReloadCount] = useState(0);
  const readIdsRef = useRef(new Set());

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const { data } = await getNotificationList({ size: SIZE, unreadOnly: true });
        if (!ignore) setItems((data ?? []).filter((item) => !readIdsRef.current.has(item.id)));
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
      readIdsRef.current.add(notificationId);
      setItems((prev) => prev.filter((item) => item.id !== notificationId));
      try {
        await postNotificationRead(notificationId);
      } catch (error) {
        readIdsRef.current.delete(notificationId);
        if (isUnauthorizedError(error)) onUnauthorized?.();
      }
    },
    [onUnauthorized],
  );

  return { items, refetch, markRead };
};
