import { keepPreviousData } from '@tanstack/react-query';
import { getAdminDocumentList, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../shared/useApiQuery';

// 관리자 문서 목록(GET /admin/documents, 계약 8장). 메타데이터만 온다. data = { items, meta: { page, size, total, hasNext } }
// 쪽 번호로 넘기는 표라서 앞 쪽 결과에 이어 붙이지 않고 바꿔 끼운다. 다른 쪽을 받는 동안 이전 쪽을 그대로 보여 준다.
// resourceType은 쉼표로 여러 값(빈 값이면 모든 종류). 401이면 오류 대신 onUnauthorized를 부른다.
export const useGetAdminDocumentList = ({ resourceType, uploaderId, from, until, page = 1, size = 20 } = {}, { onUnauthorized } = {}) => {
  const params = {
    resourceType: resourceType || undefined,
    uploaderId: uploaderId || undefined,
    from: from || undefined,
    until: until || undefined,
    page,
    size,
  };
  return useApiQuery({
    queryKey: [queryKey.ADMIN_DOCUMENTS, params],
    queryFn: async () => {
      const { data: items, meta } = await getAdminDocumentList(params);
      return { items, meta };
    },
    placeholderData: keepPreviousData,
    onUnauthorized,
  });
};
