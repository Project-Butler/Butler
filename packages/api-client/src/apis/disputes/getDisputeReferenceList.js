import axiosInstance from '../../axios/axiosInstance';

// params: { type, category, propertyKind, q, page, size, sort } — category는 쉼표로 여러 개
export const getDisputeReferenceList = async (params) => {
  const { data } = await axiosInstance.get('/disputes/references', { params });
  return data; // { data: [...], meta: { page, size, total, hasNext, countsByType: { CASE, … }, countsByCategory: { DEPOSIT_RETURN, … } } }
};
