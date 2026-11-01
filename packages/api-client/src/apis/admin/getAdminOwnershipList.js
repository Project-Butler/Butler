import axiosInstance from '../../axios/axiosInstance';

// params: { verificationStatus?: 'UNVERIFIED' | 'VERIFIED' | 'EXPIRED' | 'REVOKED', page, size }
export const getAdminOwnershipList = async (params) => {
  const { data } = await axiosInstance.get('/admin/property-ownerships', { params });
  return data; // { data: [...], meta: { page, size, total, hasNext } }
};
