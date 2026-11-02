import axiosInstance from '../../axios/axiosInstance';

// params: { status?, reasonCode?, ownershipId?, cursor?, size }
export const getAdminOwnershipVerificationAttemptList = async (params) => {
  const { data } = await axiosInstance.get('/admin/ownership-verification-attempts', { params });
  return data; // { data: [...], meta: { nextCursor, hasNext } }
};
