import axiosInstance from '../../axios/axiosInstance';

// 임대인이 초대 링크를 만든다(활성 소유자). body: { sharedDocumentIds?: uuid[] } — 그 계약의 CONTRACT 문서, 최대 10
// 응답 { id, inviteUrl, expiresAt, status, sharedDocumentCount ... } (inviteUrl은 이때 한 번만 내려온다)
export const postTenantInvitation = async (contractId, { sharedDocumentIds } = {}) => {
  const { data } = await axiosInstance.post(`/contracts/${contractId}/tenant-invitations`, { sharedDocumentIds });
  return data.data;
};
