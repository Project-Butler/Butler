import axiosInstance from '../../axios/axiosInstance';

export const getCommunityPoll = async (pollId) => {
  const { data } = await axiosInstance.get(`/community/polls/${pollId}`);
  // { id, scope, complexId, complexName, region, title, description, authorLabel, closesAt, isClosed, voteCount,
  //   hasVoted, myOptionId, isEligible, canVote, myUnitCount, canWrite, writeBlockedReason, createdAt,
  //   options: [{ id, label, position, voteCount?, percent? }], locked } — 득표는 마감 뒤에만
  // locked: true(인증 전 미리보기)면 질문 · 범위 · 마감 · 참여 인원과 자격만 있고 description · authorLabel · isMine ·
  // hasVoted · myOptionId · isEligible · canVote · myUnitCount · options 가 없다
  return data.data;
};
