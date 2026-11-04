import axiosInstance from '../../axios/axiosInstance';

// complexId: 화면의 현재 건물. 작성자 표기("○○아파트 103동 임대인")를 서버가 이 단지로 만든다.
export const postCommunityPost = async ({ legalDongCode, complexId, category, title, body }) => {
  const { data } = await axiosInstance.post(`/community/regions/${legalDongCode}/posts`, { complexId, category, title, body });
  return data.data; // getCommunityPost와 같은 모양
};
