import { getTicketList, queryKey } from '@butler/api-client';
import { useApiPagedQuery } from '../../../shared/useApiQuery';

// 수리·점검 요청 목록(GET /tickets). status는 'OPEN,IN_PROGRESS'처럼 쉼표로. data = { items, meta: { page, size, total, hasNext } }.
// page가 1보다 크면 앞 페이지 결과 뒤에 이어 붙인다([더 보기]). 필터가 바뀌면 쓰는 쪽에서 page를 1로 되돌린다.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetTicketList = ({ propertyId, status, category, page = 1, size = 20 } = {}, { onUnauthorized } = {}) =>
  useApiPagedQuery({
    queryKey: [queryKey.TICKETS, { propertyId, status, category, size }],
    fetchPage: async (pageNumber) => {
      const { data: items, meta } = await getTicketList({ propertyId, status, category, page: pageNumber, size });
      return { items, meta };
    },
    page,
    onUnauthorized,
  });
