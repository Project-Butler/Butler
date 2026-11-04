import axiosInstance from '../../axios/axiosInstance';

// scope: 'COMPLEX'(우리 단지) | 'REGION'(법정동) — 등록 뒤에는 바꿀 수 없다.
// complexId: 화면의 현재 건물(작성자 표기, COMPLEX 면 투표 대상 단지). closesOn: 'YYYY-MM-DD'(그날 23:59 KST 마감)
export const postCommunityPoll = async ({ legalDongCode, scope, complexId, title, description, options, closesOn }) => {
  const { data } = await axiosInstance.post(`/community/regions/${legalDongCode}/polls`, {
    scope,
    complexId,
    title,
    description,
    options,
    closesOn,
  });
  return data.data; // getCommunityPoll과 같은 모양
};
