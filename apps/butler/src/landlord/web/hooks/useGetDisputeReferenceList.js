import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getDisputeReferenceList, queryKey } from '@butler/api-client';

// 분쟁 참고자료 목록. 검색어·탭을 바꾸는 동안 이전 결과를 그대로 보여 줘서 목록이 깜빡이지 않게 한다.
// params: { type, category, q, page, size }
export const useGetDisputeReferenceList = (params) =>
  useQuery({
    queryKey: [queryKey.DISPUTE_REFERENCES, params],
    queryFn: () => getDisputeReferenceList(params),
    placeholderData: keepPreviousData,
  });
