import axiosInstance from '../../axios/axiosInstance';

export const getCommunityPost = async (postId) => {
  const { data } = await axiosInstance.get(`/community/posts/${postId}`);
  // { id, legalDongCode, category, title, body, authorLabel, commentCount, isMine, canWrite, createdAt, updatedAt,
  //   comments: [{ id, body, authorLabel, isMine, createdAt }] }
  return data.data;
};
