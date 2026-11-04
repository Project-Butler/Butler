import axiosInstance from '../../axios/axiosInstance';

// 페이지를 나누지 않는다 — 전량을 한 번에 돌려준다(meta 는 봉투 모양을 맞춘 page: 1, hasNext: false).
export const getMyBuildings = async () => {
  const { data } = await axiosInstance.get('/community/my-buildings');
  return data.data; // [{ complexId, name, legalDongCode, regionName, unitCount, unitAreas, memberCount }] — unitAreas: 인증 호실 전용면적(㎡) 목록
};
