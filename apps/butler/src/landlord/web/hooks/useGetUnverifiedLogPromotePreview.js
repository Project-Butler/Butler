import { getUnverifiedLogPromotePreview, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';

// 인증 전 기록 올리기 미리보기(GET /property-ownerships/:ownershipId/management-logs/promote-preview, H-44).
// data = { count, items: [{ id, title, type, occurredOn }] }. ownershipId가 없으면 호출하지 않는다.
// 한 번 고르면 다시 묻지 않으므로 캐시에 남기지 않는다(다시 열 때 지난 미리보기가 잠깐 뜨지 않게).
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetUnverifiedLogPromotePreview = (ownershipId, { onUnauthorized } = {}) =>
  useApiQuery({
    queryKey: [queryKey.MANAGEMENT_LOG_PROMOTE_PREVIEW, ownershipId],
    queryFn: () => getUnverifiedLogPromotePreview(ownershipId),
    enabled: Boolean(ownershipId),
    gcTime: 0,
    onUnauthorized,
  });
