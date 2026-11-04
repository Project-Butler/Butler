import axiosInstance from '../../axios/axiosInstance';

export const postCommunityVote = async ({ pollId, optionId }) => {
  const { data } = await axiosInstance.post(`/community/polls/${pollId}/votes`, { optionId });
  return data.data; // getCommunityPoll과 같은 모양
};
