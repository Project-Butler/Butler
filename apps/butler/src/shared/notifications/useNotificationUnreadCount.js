import { useEffect, useState } from 'react';
import { getNotificationUnreadCount } from '@butler/api-client';
import { isUnauthorizedError } from '../apiError';

// 안 읽은 알림 수(GET /notifications/unread-count). 실패하면 0으로 둔다(상단 바 숫자만 빠진다).
// 401이면 onUnauthorized 를 부른다.
export const useNotificationUnreadCount = ({ onUnauthorized } = {}) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const data = await getNotificationUnreadCount();
        if (!ignore) setCount(data?.count ?? 0);
      } catch (error) {
        if (!ignore && isUnauthorizedError(error)) onUnauthorized?.();
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [onUnauthorized]);

  return count;
};
