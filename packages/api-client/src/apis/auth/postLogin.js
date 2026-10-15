import axiosInstance from '../../axios/axiosInstance';

export const postLogin = async ({ email, password }) => {
  const { data } = await axiosInstance.post('/auth/login', { email, password });
  return data.data;
};
