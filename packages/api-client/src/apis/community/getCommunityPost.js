import axiosInstance from '../../axios/axiosInstance';

export const getCommunityPost = async (postId) => {
  const { data } = await axiosInstance.get(`/community/posts/${postId}`);
  // { id, legalDongCode, category, title, authorLabel, commentCount, isMine, canWrite, writeBlockedReason, createdAt, locked,
  //   body, updatedAt, comments: [{ id, body, authorLabel, isMine, createdAt }] }
  // locked: true(인증 전 미리보기)면 body · updatedAt · comments 가 없다
  return data.data;
};
