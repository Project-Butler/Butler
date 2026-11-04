import axiosInstance from '../../axios/axiosInstance';

export const getCommunityPoll = async (pollId) => {
  const { data } = await axiosInstance.get(`/community/polls/${pollId}`);
  // { id, scope, complexId, complexName, region, title, description, authorLabel, closesAt, isClosed, voteCount,
  //   hasVoted, myOptionId, isEligible, canVote, myUnitCount, canWrite, writeBlockedReason, createdAt,
  //   options: [{ id, label, position, voteCount?, percent? }] } — 득표는 마감 뒤에만
  return data.data;
};
