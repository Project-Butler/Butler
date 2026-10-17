import axiosInstance from '../../axios/axiosInstance';

// params: { type, category, propertyKind, q, page, size, sort }
export const getDisputeReferenceList = async (params) => {
  const { data } = await axiosInstance.get('/disputes/references', { params });
  return data; // { data: [...], meta: { page, size, total, hasNext } }
};
