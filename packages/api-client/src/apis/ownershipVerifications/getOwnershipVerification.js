import axiosInstance from '../../axios/axiosInstance';

// 진행 상태 확인용. 본인 시도만, 아니면 404 OWNERSHIP_VERIFICATION_NOT_FOUND
export const getOwnershipVerification = async (attemptId) => {
  const { data } = await axiosInstance.get(`/ownership-verifications/${attemptId}`);
  return data.data;
};
