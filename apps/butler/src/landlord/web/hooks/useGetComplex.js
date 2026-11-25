import { getComplex, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';

// 단지 상세(GET /complexes/:complexId) — 주소·법정동·건물 정보.
// complexId가 없으면 호출하지 않는다. 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetComplex = (complexId, { onUnauthorized } = {}) =>
  useApiQuery({
    queryKey: [queryKey.COMPLEX_DETAIL, complexId],
    queryFn: () => getComplex(complexId),
    enabled: Boolean(complexId),
    onUnauthorized,
  });
