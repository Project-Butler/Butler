import axiosInstance from '../../axios/axiosInstance';

// params: { active, page, size }
export const getPropertyOwnershipList = async (params) => {
  const { data } = await axiosInstance.get('/property-ownerships', { params });
  return data; // { data: [...], meta: { page, size, total, hasNext } }
};
