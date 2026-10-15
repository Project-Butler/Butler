import axiosInstance from '../../axios/axiosInstance';

// 204 No Content — 반환할 데이터가 없다.
export const postLogout = async () => {
  await axiosInstance.post('/auth/logout');
};
