import axiosInstance from '../../axios/axiosInstance';

export const getCommunityPoll = async (pollId) => {
  const { data } = await axiosInstance.get(`/community/polls/${pollId}`);
  // { id, scope, complexId, complexName, region, title, description, authorLabel, closesAt, isClosed, voteCount(참여 인원),
  //   hasVoted, myOptionId, isEligible, canVote, myUnitCount(범위 안 인증 호실 수), myWeight(내 표 수 — 참여했으면 그때 굳힌 값),
  //   canWrite, writeBlockedReason, createdAt, weightTotal?(총 표 수),
  //   options: [{ id, label, position, voteCount?, weightTotal?, percent? }], locked } — 득표 · 총 표 수는 마감 뒤에만, 비율은 표 수 기준
  // locked: true(인증 전 미리보기)면 질문 · 범위 · 마감 · 참여 인원과 자격만 있고 description · authorLabel · isMine ·
  // hasVoted · myOptionId · isEligible · canVote · myUnitCount · myWeight · weightTotal · options 가 없다
  return data.data;
};
