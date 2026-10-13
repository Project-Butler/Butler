import axiosInstance from '../../axios/axiosInstance';

export const postLogout = async () => {
  const { data } = await axiosInstance.post('/api/auth/logout');
  return data;
};
