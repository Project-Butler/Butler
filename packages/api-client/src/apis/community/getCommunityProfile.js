import axiosInstance from '../../axios/axiosInstance';

// 내 커뮤니티 닉네임. complexId: 지금 고른 건물 — 미리보기 줄의 괄호 속 표기(previewLabel)를 그 건물 기준으로 받는다.
export const getCommunityProfile = async ({ complexId } = {}) => {
  const { data } = await axiosInstance.get('/community/me/profile', { params: { complexId } });
  return data.data; // { nickname: string | null, nextChangeAt: ISO | null, previewLabel: string | null }
};
