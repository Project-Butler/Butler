import { getTicket, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../shared/useApiQuery';

// 수리·점검 요청 상세(GET /tickets/:ticketId, 계약 5장). 운영자에게 처리 비용(cost)은 서버가 null로 준다.
// ticketId가 없으면 호출하지 않는다. 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetAdminTicket = (ticketId, { onUnauthorized } = {}) =>
  useApiQuery({
    queryKey: [queryKey.TICKET_DETAIL, 'admin', ticketId],
    queryFn: () => getTicket(ticketId),
    enabled: Boolean(ticketId),
    onUnauthorized,
  });
