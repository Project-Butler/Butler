import { getContractList, queryKey } from '@butler/api-client';
import { useApiPagedQuery } from '../../../shared/useApiQuery';

// 계약 목록(GET /contracts). status는 'ACTIVE,EXPIRING_SOON'처럼 쉼표로. data = { items, meta: { page, size, total, hasNext } }.
// page가 1보다 크면 앞 페이지 결과 뒤에 이어 붙인다([더 보기]). 필터가 바뀌면 쓰는 쪽에서 page를 1로 되돌린다.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
// refetch()는 같은 page를 다시 불러온다(오류가 난 페이지 재시도용).
export const useGetContractList = (
  { propertyId, ownershipId, status, sort, activeOwnership, includeEndedOwnership, page = 1, size = 20 } = {},
  { onUnauthorized } = {},
) =>
  useApiPagedQuery({
    queryKey: [queryKey.CONTRACTS, { propertyId, ownershipId, status, sort, activeOwnership, includeEndedOwnership, size }],
    fetchPage: async (pageNumber) => {
      const { data: items, meta } = await getContractList({
        propertyId,
        ownershipId,
        status,
        sort,
        activeOwnership,
        includeEndedOwnership,
        page: pageNumber,
        size,
      });
      return { items, meta };
    },
    page,
    onUnauthorized,
  });
