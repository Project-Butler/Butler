import axiosInstance from '../../axios/axiosInstance';

// 호실 상세의 진행 표시용. 이 소유 관계의 내 시도 중 최신 1건, 없으면 null
export const getLatestOwnershipVerification = async (ownershipId) => {
  const { data } = await axiosInstance.get('/ownership-verifications', { params: { ownershipId } });
  return data.data;
};
