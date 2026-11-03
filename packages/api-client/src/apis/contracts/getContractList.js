import axiosInstance from '../../axios/axiosInstance';

// params: { propertyId?, ownershipId?, status?('ACTIVE,EXPIRING_SOON'처럼 쉼표), sort?('endDate:asc'), activeOwnership?, includeEndedOwnership?, page, size }
export const getContractList = async (params) => {
  const { data } = await axiosInstance.get('/contracts', { params });
  return data; // { data: [...], meta: { page, size, total, hasNext } }
};
