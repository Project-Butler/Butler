import { getPropertyOwnership, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';

// 소유 관계 상세(GET /property-ownerships/:ownershipId).
// ownershipId가 없으면 호출하지 않는다. 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetPropertyOwnership = (ownershipId, { onUnauthorized } = {}) =>
  useApiQuery({
    queryKey: [queryKey.PROPERTY_OWNERSHIP_DETAIL, ownershipId],
    queryFn: () => getPropertyOwnership(ownershipId),
    enabled: Boolean(ownershipId),
    onUnauthorized,
  });
