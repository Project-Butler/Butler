import { getRenewalNoticeList, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';

// 갱신 거절 통지 기록(GET /contracts/:contractId/renewal-notices, 최신순·페이지 없음). 타임라인의 계약 점(H-25)용.
// contractId가 없으면 호출하지 않는다. 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetRenewalNoticeList = (contractId, { onUnauthorized } = {}) =>
  useApiQuery({
    queryKey: [queryKey.CONTRACT_RENEWAL_NOTICES, contractId],
    queryFn: () => getRenewalNoticeList(contractId),
    enabled: Boolean(contractId),
    onUnauthorized,
  });
