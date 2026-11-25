import { getPropertyList, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';

const PAGE_SIZE = 100; // 서버 요청 검증의 최대 size

// 관계(OWNER·FORMER_OWNER)별 호실 전체. 한 페이지(100개)씩 hasNext가 끝날 때까지 이어 받는다.
// data = 호실 배열(항목마다 documentCount). 401이면 onUnauthorized. refetch()는 지금 데이터를 둔 채 다시 받는다.
export const useGetAllPropertyList = (relation, { onUnauthorized } = {}) =>
  useApiQuery({
    queryKey: [queryKey.PROPERTIES_ALL, relation],
    queryFn: async () => {
      const items = [];
      for (let page = 1; ; page += 1) {
        const { data, meta } = await getPropertyList({ relation, page, size: PAGE_SIZE });
        items.push(...data);
        if (!meta.hasNext) break;
      }
      return items;
    },
    onUnauthorized,
  });
