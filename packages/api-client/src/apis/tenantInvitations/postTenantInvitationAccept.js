import axiosInstance from '../../axios/axiosInstance';

// 로그인한 TENANT가 초대를 수락해 계약에 연결된다(확인 세션 필요). 응답은 Contract
export const postTenantInvitationAccept = async (token) => {
  const { data } = await axiosInstance.post(`/tenant-invitations/${encodeURIComponent(token)}/accept`);
  return data.data;
};
