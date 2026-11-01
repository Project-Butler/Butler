import axiosInstance from '../../axios/axiosInstance';

// body: { status: 'ACTIVE' | 'SUSPENDED', reason } — 정지할 때 reason 필수, 정지하면 그 회원의 세션이 모두 끊긴다
export const patchAdminUserStatus = async (userId, body) => {
  const { data } = await axiosInstance.patch(`/admin/users/${userId}/status`, body);
  return data.data;
};
