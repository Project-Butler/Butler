import axiosInstance from '../../axios/axiosInstance';

// body: { reason } — 인증을 철회한다(verificationStatus: REVOKED). 응답은 소유 관계 전체 + owner
export const postAdminOwnershipRevoke = async (ownershipId, body) => {
  const { data } = await axiosInstance.post(`/admin/property-ownerships/${ownershipId}/revoke`, body);
  return data.data;
};
