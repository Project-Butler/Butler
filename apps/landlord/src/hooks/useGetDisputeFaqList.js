import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getDisputeFaqList, queryKey } from '@butler/api-client';

// 자주 묻는 질문. params: { category, q } — 참고자료 목록과 같은 조건으로 서버가 거른다.
export const useGetDisputeFaqList = (params = {}) =>
  useQuery({
    queryKey: [queryKey.DISPUTE_FAQS, params],
    queryFn: () => getDisputeFaqList(params),
    placeholderData: keepPreviousData,
    staleTime: 10 * 60 * 1000,
  });
