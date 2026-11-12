import axiosInstance from '../../axios/axiosInstance';

// params: { contextType?, contextId?, page, size }. 최근 메시지 순.
export const getThreadList = async (params) => {
  const { data } = await axiosInstance.get('/threads', { params });
  return data; // { data: [...], meta: { page, size, total, hasNext } }
};
