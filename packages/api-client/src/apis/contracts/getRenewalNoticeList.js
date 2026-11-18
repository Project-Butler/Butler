import axiosInstance from '../../axios/axiosInstance';

// 갱신 거절 통지 기록(최신순, 페이지 없음). 계약의 소유자만 볼 수 있다(그 밖은 404).
export const getRenewalNoticeList = async (contractId) => {
  const { data } = await axiosInstance.get(`/contracts/${contractId}/renewal-notices`);
  return data.data;
};
