import axiosInstance from '../../axios/axiosInstance';

// params: { legalDongCode, scope?: 'COMPLEX'|'REGION', status?: 'OPEN'|'CLOSED', complexId?, page, size }
// complexId 는 화면의 현재 건물 — "우리 단지" 투표를 그 단지로 거른다.
export const getCommunityPollList = async ({ legalDongCode, ...params }) => {
  const { data } = await axiosInstance.get(`/community/regions/${legalDongCode}/polls`, { params });
  // { data: [{ id, scope, complexId, title, closesAt, isClosed, voteCount, hasVoted }],
  //   meta: { page, size, total, hasNext, region, canWrite, writeBlockedReason } }
  return data;
};
