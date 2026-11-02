import axiosInstance from '../../axios/axiosInstance';

// body: { reason } — 운영자 종료(endReason: ADMIN_ENDED). 계약이 있어도 종료된다. 응답은 소유 관계 전체 + owner
export const postAdminOwnershipEnd = async (ownershipId, body) => {
  const { data } = await axiosInstance.post(`/admin/property-ownerships/${ownershipId}/end`, body);
  return data.data;
};
