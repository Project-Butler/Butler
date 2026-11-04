import axiosInstance from '../../axios/axiosInstance';

// fields: { category?, title?, body? } — 보낸 것만 고친다
export const patchCommunityPost = async ({ postId, ...fields }) => {
  const { data } = await axiosInstance.patch(`/community/posts/${postId}`, fields);
  return data.data; // getCommunityPost와 같은 모양
};
