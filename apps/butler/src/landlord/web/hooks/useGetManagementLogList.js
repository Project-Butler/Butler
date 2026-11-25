import { getManagementLogList, queryKey } from '@butler/api-client';
import { useApiPagedQuery } from '../../../shared/useApiQuery';

// 관리 로그 목록(GET /management-logs). type은 'REPAIR,NOTE'처럼 쉼표로. data = { items, meta: { page, size, total, hasNext } }.
// page가 1보다 크면 앞 페이지 결과 뒤에 이어 붙인다([더 보기]). 필터가 바뀌면 쓰는 쪽에서 page를 1로 되돌린다.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetManagementLogList = ({ propertyId, type, until, page = 1, size = 20 } = {}, { onUnauthorized } = {}) =>
  useApiPagedQuery({
    queryKey: [queryKey.MANAGEMENT_LOGS, { propertyId, type, until, size }],
    fetchPage: async (pageNumber) => {
      const { data: items, meta } = await getManagementLogList({ propertyId, type, until, page: pageNumber, size });
      return { items, meta };
    },
    page,
    onUnauthorized,
  });
