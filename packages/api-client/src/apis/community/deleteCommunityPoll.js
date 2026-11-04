import axiosInstance from '../../axios/axiosInstance';

// 등록자 본인, 참여자가 0명일 때만 지워진다(그 밖은 409 COMMUNITY_POLL_HAS_VOTES)
export const deleteCommunityPoll = async (pollId) => {
  await axiosInstance.delete(`/community/polls/${pollId}`);
};
