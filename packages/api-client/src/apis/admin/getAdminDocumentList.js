import axiosInstance from '../../axios/axiosInstance';

// 관리자 문서 목록(메타데이터만, api-contract.md 8장).
// params: { resourceType?: 'CONTRACT,TICKET,...'(쉼표), uploaderId?, from?: 'YYYY-MM-DD', until?: 'YYYY-MM-DD', page, size }
export const getAdminDocumentList = async (params) => {
  const { data } = await axiosInstance.get('/admin/documents', { params });
  return data; // { data: [...], meta: { page, size, total, hasNext } }
};
