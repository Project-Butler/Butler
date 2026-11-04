import axiosInstance from '../../axios/axiosInstance';

// 만료 30일 이내·만료된 내 활성 소유 관계(PropertyOwnership 배열), 만료가 빠른 순
export const getOwnershipVerificationRenewalTargetList = async () => {
  const { data } = await axiosInstance.get('/ownership-verifications/renewal-targets');
  return data.data;
};
