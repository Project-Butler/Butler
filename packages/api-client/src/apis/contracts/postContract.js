import axiosInstance from '../../axios/axiosInstance';

// body: { ownershipId, leaseType, deposit, monthlyRent, startDate, endDate, tenantName, tenantPhone, previousContractId?, memo? }
export const postContract = async (body) => {
  const { data } = await axiosInstance.post('/contracts', body);
  return data.data;
};
