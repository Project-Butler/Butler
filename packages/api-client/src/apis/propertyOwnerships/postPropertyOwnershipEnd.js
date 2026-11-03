import axiosInstance from '../../axios/axiosInstance';

// body: { reason?, endReason?: 'SELF_ENDED' | 'SOLD' } — SELF_ENDED(기본)는 진행 중인 계약이 있으면 422 OWNERSHIP_HAS_ACTIVE_CONTRACTS.
// SOLD는 계약이 있어도 끝나고 계약은 읽기 전용으로 남는다.
export const postPropertyOwnershipEnd = async (ownershipId, body) => {
  const { data } = await axiosInstance.post(`/property-ownerships/${ownershipId}/end`, body);
  return data.data;
};
