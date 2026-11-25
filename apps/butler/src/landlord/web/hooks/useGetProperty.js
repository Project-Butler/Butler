import { getProperty, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';

// 호실 상세(GET /properties/:propertyId).
// propertyId가 없으면 호출하지 않는다. 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetProperty = (propertyId, { onUnauthorized } = {}) =>
  useApiQuery({
    queryKey: [queryKey.PROPERTY_DETAIL, propertyId],
    queryFn: () => getProperty(propertyId),
    enabled: Boolean(propertyId),
    onUnauthorized,
  });
