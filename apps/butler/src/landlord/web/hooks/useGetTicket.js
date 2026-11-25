import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getTicket, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';

// 수리·점검 요청 상세(GET /tickets/:ticketId). 볼 수 없으면 404 TICKET_NOT_FOUND가 error로 온다.
// 처리 상태를 바꾼 뒤에는 setData로 응답을 바로 반영한다(다시 불러오지 않는다).
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetTicket = (ticketId, { onUnauthorized } = {}) => {
  const queryClient = useQueryClient();
  const query = useApiQuery({
    queryKey: [queryKey.TICKET_DETAIL, ticketId],
    queryFn: () => getTicket(ticketId),
    enabled: Boolean(ticketId),
    onUnauthorized,
  });
  const setData = useCallback((data) => queryClient.setQueryData([queryKey.TICKET_DETAIL, ticketId], data), [queryClient, ticketId]);

  return { ...query, setData };
};
