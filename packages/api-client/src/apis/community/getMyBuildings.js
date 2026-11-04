import axiosInstance from '../../axios/axiosInstance';

// 페이지를 나누지 않는다 — 전량을 한 번에 돌려준다(meta 는 봉투 모양을 맞춘 page: 1, hasNext: false).
export const getMyBuildings = async () => {
  const { data } = await axiosInstance.get('/community/my-buildings');
  // [{ complexId, name, legalDongCode, regionName, unitCount, unitAreas, memberCount, verificationStatus, verifyPropertyId }]
  // 활성 호실이 있는 건물 전부(인증 전 · 만료 포함). unitAreas: 활성 호실 전용면적(㎡), verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'EXPIRED',
  // verifyPropertyId: 인증이 필요하면 권리자 인증 화면으로 갈 호실 id
  return data.data;
};
