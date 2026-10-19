import axiosInstance from '../../axios/axiosInstance';

// body: { reason? } — 진행 중인 계약이 있으면 422 OWNERSHIP_HAS_ACTIVE_CONTRACTS
export const postPropertyOwnershipEnd = async (ownershipId, body) => {
  const { data } = await axiosInstance.post(`/property-ownerships/${ownershipId}/end`, body);
  return data.data;
};
