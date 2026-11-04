import axiosInstance from '../../axios/axiosInstance';

// params: { legalDongCode, category?, mine?, page, size }
export const getCommunityPostList = async ({ legalDongCode, ...params }) => {
  const { data } = await axiosInstance.get(`/community/regions/${legalDongCode}/posts`, { params });
  // { data: [{ id, category, title, authorLabel, commentCount, isMine, createdAt }],
  //   meta: { page, size, total, hasNext, region: { legalDongCode, dongName, fullName }, canWrite } }
  return data;
};
