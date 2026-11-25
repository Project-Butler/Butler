import { useCallback, useMemo, useRef, useState } from 'react';
import { getNotificationList, postNotificationRead, queryKey } from '@butler/api-client';
import { isUnauthorizedError } from '../../../shared/apiError';
import { useApiQuery } from '../../../shared/useApiQuery';

const SIZE = 20;

// PC 위 막대 종에 띄울 안 읽은 알림(GET /notifications?unreadOnly=true, 최신 20개). 실패하면 빈 목록(종만 조용해진다).
// markRead(id): 화면에서 먼저 빼고 저장한다. 저장보다 다시 불러오기가 먼저 끝나도 다시 보이지 않게, 이 화면에서 읽은 id 는 기억해서 거른다.
// 저장이 실패하면 기억에서 지워 바로 다시 안 읽음으로 보이게 한다. 401이면 onUnauthorized.
export const useGetUnreadNotifications = ({ onUnauthorized } = {}) => {
  const query = useApiQuery({
    queryKey: [queryKey.NOTIFICATIONS, { unreadOnly: true, size: SIZE }],
    queryFn: async () => (await getNotificationList({ size: SIZE, unreadOnly: true })).data ?? [],
    onUnauthorized,
  });
  const readIdsRef = useRef(new Set());
  // 읽은 id 묶음이 바뀌면 목록을 다시 거르게 하는 값(ref 는 바뀌어도 다시 그리지 않으므로).
  const [readVersion, setReadVersion] = useState(0);

  const items = useMemo(
    () => (query.data ?? []).filter((item) => !readIdsRef.current.has(item.id)),
    // readVersion 은 readIdsRef 가 바뀐 것을 알린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data, readVersion],
  );

  const markRead = useCallback(
    async (notificationId) => {
      readIdsRef.current.add(notificationId);
      setReadVersion((version) => version + 1);
      try {
        await postNotificationRead(notificationId);
      } catch (error) {
        readIdsRef.current.delete(notificationId);
        setReadVersion((version) => version + 1);
        if (isUnauthorizedError(error)) onUnauthorized?.();
      }
    },
    [onUnauthorized],
  );

  return { items, refetch: query.refetch, markRead };
};
