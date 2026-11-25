import { getTenantInvitationList, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';

// 계약의 초대 발급 목록(A-07, 최신이 앞). 활성 소유자만 볼 수 있어 쓰는 쪽에서 필요할 때만 contractId를 넘긴다.
// data = [{ id, status, expiresAt, sharedDocumentCount, createdAt, inviteUrl: null }]. 401이면 onUnauthorized.
export const useGetTenantInvitationList = (contractId, { onUnauthorized } = {}) =>
  useApiQuery({
    queryKey: [queryKey.TENANT_INVITATIONS, contractId],
    queryFn: () => getTenantInvitationList(contractId),
    enabled: Boolean(contractId),
    onUnauthorized,
  });
