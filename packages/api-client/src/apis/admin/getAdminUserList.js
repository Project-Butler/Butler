import axiosInstance from '../../axios/axiosInstance';

// params: { query?, role?, status?, page, size }
export const getAdminUserList = async (params) => {
  const { data } = await axiosInstance.get('/admin/users', { params });
  return data; // { data: [...], meta: { page, size, total, hasNext } }
};
