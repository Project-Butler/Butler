import axiosInstance from '../../axios/axiosInstance';

// { validityYears, updatedAt }
export const getAdminOwnershipVerificationSetting = async () => {
  const { data } = await axiosInstance.get('/admin/settings/ownership-verification');
  return data.data;
};
