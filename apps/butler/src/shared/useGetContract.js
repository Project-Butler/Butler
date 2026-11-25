import { getContract, queryKey } from '@butler/api-client';
import { useApiQuery } from './useApiQuery';

// 계약 상세(GET /contracts/:contractId). 운영자에게 보이는 범위는 서버가 정한다(memo는 null).
// contractId가 없으면 호출하지 않는다. 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetContract = (contractId, { onUnauthorized } = {}) =>
  useApiQuery({
    queryKey: [queryKey.CONTRACT_DETAIL, contractId],
    queryFn: () => getContract(contractId),
    enabled: Boolean(contractId),
    onUnauthorized,
  });
