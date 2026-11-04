import axiosInstance from '../../axios/axiosInstance';

export const deleteCommunityComment = async (commentId) => {
  await axiosInstance.delete(`/community/comments/${commentId}`);
};
