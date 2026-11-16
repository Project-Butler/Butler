import axiosInstance from '../../axios/axiosInstance';

// 닉네임 정하기 · 바꾸기. 규칙(2~12자 · 한글 · 영문 · 숫자 · 30일에 한 번)은 서버가 본다.
// 에러: COMMUNITY_NICKNAME_INVALID · COMMUNITY_NICKNAME_NOT_ALLOWED(400), COMMUNITY_NICKNAME_TAKEN · COMMUNITY_NICKNAME_CHANGE_TOO_SOON(409)
export const putCommunityProfile = async ({ nickname, complexId }) => {
  const { data } = await axiosInstance.put('/community/me/profile', { nickname, complexId });
  return data.data; // { nickname, nextChangeAt, previewLabel }
};
