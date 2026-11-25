import { getPropertyOwnershipList, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';

// 내 소유 관계 목록(GET /property-ownerships). data = { items, meta: { page, size, total, hasNext } }.
// active: 'true'(활성만) · 'false'(종료만) · 생략(전체).
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetPropertyOwnershipList = ({ active, page = 1, size = 20 } = {}, { onUnauthorized } = {}) =>
  useApiQuery({
    queryKey: [queryKey.PROPERTY_OWNERSHIPS, { active, page, size }],
    queryFn: async () => {
      const { data: items, meta } = await getPropertyOwnershipList({ active, page, size });
      return { items, meta };
    },
    onUnauthorized,
  });
