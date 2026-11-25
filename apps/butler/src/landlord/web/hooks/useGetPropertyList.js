import { getPropertyList, queryKey } from '@butler/api-client';
import { useApiPagedQuery } from '../../../shared/useApiQuery';

// 내 호실 목록(GET /properties). complexId를 주면 그 단지(건물)의 호실만. data = { items, meta: { page, size, total, hasNext } }.
// page가 1보다 크면 앞 페이지 결과 뒤에 이어 붙인다([더 보기]). relation이 바뀌면 쓰는 쪽에서 page를 1로 되돌린다.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
// refetch()는 같은 page를 다시 불러온다(오류가 난 페이지 재시도용).
export const useGetPropertyList = ({ relation = 'OWNER', complexId, page = 1, size = 20 } = {}, { onUnauthorized } = {}) =>
  useApiPagedQuery({
    queryKey: [queryKey.PROPERTIES, { relation, complexId, size }],
    fetchPage: async (pageNumber) => {
      const { data: items, meta } = await getPropertyList({ relation, complexId, page: pageNumber, size });
      return { items, meta };
    },
    page,
    onUnauthorized,
  });
