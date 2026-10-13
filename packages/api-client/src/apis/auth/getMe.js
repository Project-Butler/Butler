import axiosInstance from '../../axios/axiosInstance';

export const getMe = async () => {
  const { data } = await axiosInstance.get('/api/auth/me');
  return data;
};
