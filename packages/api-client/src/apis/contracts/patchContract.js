import axiosInstance from '../../axios/axiosInstance';

// body: { leaseType?, deposit?, monthlyRent?, startDate?, endDate?, tenantName?, tenantPhone?, memo? }
// 진행 중(ACTIVE·EXPIRING_SOON) 계약은 tenantPhone·memo만 바꿀 수 있다(422 CONTRACT_READ_ONLY)
export const patchContract = async (contractId, body) => {
  const { data } = await axiosInstance.patch(`/contracts/${contractId}`, body);
  return data.data;
};
