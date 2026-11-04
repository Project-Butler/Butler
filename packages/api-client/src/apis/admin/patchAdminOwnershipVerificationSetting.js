import axiosInstance from '../../axios/axiosInstance';

// body: { validityYears } — 1~100 정수. 새 인증부터 적용
export const patchAdminOwnershipVerificationSetting = async (body) => {
  const { data } = await axiosInstance.patch('/admin/settings/ownership-verification', body);
  return data.data;
};
