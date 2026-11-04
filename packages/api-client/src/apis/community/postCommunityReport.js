import axiosInstance from '../../axios/axiosInstance';

// reason: SPAM | ABUSE | ADVERTISEMENT | PRIVACY | OTHER, detail: 선택(500자)
export const postCommunityReport = async ({ postId, reason, detail }) => {
  const { data } = await axiosInstance.post(`/community/posts/${postId}/reports`, { reason, detail });
  return data.data; // { id, reason, status, createdAt }
};
