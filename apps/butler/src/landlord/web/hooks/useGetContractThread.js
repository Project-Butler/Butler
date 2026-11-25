import { getThreadList, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';

// 이 계약의 이미 있는 대화방(GET /threads?contextType=CONTRACT&contextId=). 없으면 data는 null.
// 새로 만들지 않고 찾기만 한다(끝난 계약에 빈 대화방이 생기지 않게). contractId가 없으면 호출하지 않는다.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetContractThread = (contractId, { onUnauthorized } = {}) =>
  useApiQuery({
    queryKey: [queryKey.CONTRACT_THREAD, contractId],
    queryFn: async () => {
      const { data } = await getThreadList({ contextType: 'CONTRACT', contextId: contractId, size: 1 });
      return data[0] ?? null;
    },
    enabled: Boolean(contractId),
    onUnauthorized,
  });
