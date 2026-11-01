import axiosInstance from '../../axios/axiosInstance';

// 회원 정보 + ownerships(소유 관계 요약)
export const getAdminUser = async (userId) => {
  const { data } = await axiosInstance.get(`/admin/users/${userId}`);
  return data.data;
};
