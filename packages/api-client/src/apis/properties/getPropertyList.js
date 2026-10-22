import axiosInstance from '../../axios/axiosInstance';

// params: { relation, complexId?, page, size }
export const getPropertyList = async (params) => {
  const { data } = await axiosInstance.get('/properties', { params });
  return data; // { data: [...], meta: { page, size, total, hasNext } }
};
