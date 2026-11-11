import axiosInstance from '../../axios/axiosInstance';

// 공개 요약(로그인·본인 확인 전). 금액·임차인 정보 없음. 응답에 sharedDocumentCount 포함
export const getTenantInvitationPreview = async (token) => {
  const { data } = await axiosInstance.get(`/tenant-invitations/${encodeURIComponent(token)}`);
  return data.data;
};
