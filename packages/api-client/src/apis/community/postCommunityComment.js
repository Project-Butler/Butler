import axiosInstance from '../../axios/axiosInstance';

// complexId: 화면의 현재 건물(작성자 표기용, postCommunityPost와 같다)
export const postCommunityComment = async ({ postId, complexId, body }) => {
  const { data } = await axiosInstance.post(`/community/posts/${postId}/comments`, { complexId, body });
  return data.data; // { id, body, authorLabel, isMine, createdAt }
};
