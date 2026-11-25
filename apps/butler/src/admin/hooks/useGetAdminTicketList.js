import { keepPreviousData } from '@tanstack/react-query';
import { getTicketList, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../shared/useApiQuery';

// 수리·점검 요청 목록(GET /tickets, 계약 5장). 운영자에게는 서버가 모든 티켓을 돌려준다. data = { items, meta: { page, size, total, hasNext } }.
// 쪽 번호로 넘기는 표라서 앞 쪽 결과에 이어 붙이지 않고 바꿔 끼운다. 다른 쪽을 받는 동안 이전 쪽을 그대로 보여 준다.
// status·category는 쉼표로 여러 값을 넣을 수 있다(빈 값이면 거르지 않는다). 401이면 오류 대신 onUnauthorized를 부른다.
export const useGetAdminTicketList = ({ status, category, page = 1, size = 20 } = {}, { onUnauthorized } = {}) => {
  const params = { status: status || undefined, category: category || undefined, sort: 'createdAt:desc', page, size };
  return useApiQuery({
    queryKey: [queryKey.TICKETS, 'admin', params],
    queryFn: async () => {
      const { data: items, meta } = await getTicketList(params);
      return { items, meta };
    },
    placeholderData: keepPreviousData,
    onUnauthorized,
  });
};
