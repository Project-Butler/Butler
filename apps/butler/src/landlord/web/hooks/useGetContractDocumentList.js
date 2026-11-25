import { getDocumentList, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';
import { CONTRACT_DOCUMENT_PAGE_SIZE } from '../utils/tenantInvite';

// 계약 서류함(GET /documents?resourceType=CONTRACT&resourceId). data = 문서 배열(올린 순서).
// contractId가 없으면 호출하지 않는다. 401이면 onUnauthorized.
export const useGetContractDocumentList = (contractId, { onUnauthorized } = {}) =>
  useApiQuery({
    queryKey: [queryKey.CONTRACT_DOCUMENTS, contractId],
    queryFn: async () => {
      const { data } = await getDocumentList({ resourceType: 'CONTRACT', resourceId: contractId, size: CONTRACT_DOCUMENT_PAGE_SIZE });
      return data;
    },
    enabled: Boolean(contractId),
    onUnauthorized,
  });
