import axiosInstance from '../../axios/axiosInstance';

export const getMe = async () => {
  const { data } = await axiosInstance.get('/auth/me');
  return data.data;
};
