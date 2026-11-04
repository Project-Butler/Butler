import axiosInstance from '../../axios/axiosInstance';

export const deleteCommunityPost = async (postId) => {
  await axiosInstance.delete(`/community/posts/${postId}`);
};
