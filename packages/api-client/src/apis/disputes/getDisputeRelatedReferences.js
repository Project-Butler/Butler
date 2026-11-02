import axiosInstance from '../../axios/axiosInstance';

// 사례 상세 아래 "관련 자료"(본문이 비슷한 자료 최대 3건)
export const getDisputeRelatedReferences = async (referenceId) => {
  const { data } = await axiosInstance.get(`/disputes/references/${referenceId}/related`);
  return data.data; // 목록 항목과 같은 모양 [{ id, type, category, title, summary, ... }]
};
