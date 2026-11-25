import { getPropertyDocumentBox, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';

// 호실 하나의 문서함(GET /properties/:propertyId/documents). data = { property, documentCount, ownerships, contracts }.
// propertyId가 없으면 호출하지 않는다. 호실이 바뀌면 그 호실의 캐시(없으면 로딩)를 보여 주고, refetch()는 지금 데이터를 둔 채 다시 받는다. 401이면 onUnauthorized.
export const useGetPropertyDocumentBox = (propertyId, { onUnauthorized } = {}) =>
  useApiQuery({
    queryKey: [queryKey.PROPERTY_DOCUMENT_BOX, propertyId],
    queryFn: () => getPropertyDocumentBox(propertyId),
    enabled: Boolean(propertyId),
    onUnauthorized,
  });
