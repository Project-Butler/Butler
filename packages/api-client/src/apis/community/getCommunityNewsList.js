import axiosInstance from '../../axios/axiosInstance';

// params: { legalDongCode, scope?: 'SIGUNGU'|'SIDO'|'NATIONWIDE', page, size } — scope 가 없으면 시·군·구 + 전국 정책(시·도 제외)
export const getCommunityNewsList = async ({ legalDongCode, ...params }) => {
  const { data } = await axiosInstance.get(`/community/regions/${legalDongCode}/news`, { params });
  // { data: [{ id, scope, title, url, publisher, publishedAt }],
  //   meta: { page, size, total, hasNext, region: { legalDongCode, sigunguName, dongName, fullName, sidoLabel },
  //           sidoFallback?: SIGUNGU 일 때만 — 시·군·구 기사가 최근 7일 5건 미만이면 true } }
  return data;
};
