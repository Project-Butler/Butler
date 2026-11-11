import axiosInstance from '../../axios/axiosInstance';

// 확인 세션이 있어야 한다(없으면 403 INVITATION_VERIFY_REQUIRED).
// 응답: 계약 조건(유형·보증금·월세·입금일·기간·임대인 이름) + 공유 문서 목록 [{ id, fileName, mimeType, sizeBytes }]
export const getTenantInvitationContract = async (token) => {
  const { data } = await axiosInstance.get(`/tenant-invitations/${encodeURIComponent(token)}/contract`);
  return data.data;
};
