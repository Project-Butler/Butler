import axiosInstance from '../../axios/axiosInstance';

// params: { resourceType, resourceId, page?, size? }
export const getDocumentList = async (params) => {
  const { data } = await axiosInstance.get('/documents', { params });
  return data; // { data: [...], meta: { page, size, total, hasNext } }
};
