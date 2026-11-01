import axiosInstance from '../../axios/axiosInstance';

// params: { status?: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED', cursor?, size }
export const getAdminJobList = async (params) => {
  const { data } = await axiosInstance.get('/admin/jobs', { params });
  return data; // { data: [...], meta: { nextCursor, hasNext } }
};
