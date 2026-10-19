import axiosInstance from '../../axios/axiosInstance';

// params: { relation, page, size }
export const getPropertyList = async (params) => {
  const { data } = await axiosInstance.get('/properties', { params });
  return data; // { data: [...], meta: { page, size, total, hasNext } }
};
