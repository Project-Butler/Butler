import axiosInstance from '../../axios/axiosInstance';

// 계약의 초대 발급 목록(활성 소유자). inviteUrl은 null, status는 계산값(PENDING·ACCEPTED·EXPIRED·CANCELED)
export const getTenantInvitationList = async (contractId) => {
  const { data } = await axiosInstance.get(`/contracts/${contractId}/tenant-invitations`);
  return data.data;
};
