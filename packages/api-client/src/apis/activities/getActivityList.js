import axiosInstance from '../../axios/axiosInstance';

// params: { size } — 최신순, 페이지 없음
export const getActivityList = async (params) => {
  const { data } = await axiosInstance.get('/activities', { params });
  return data.data; // [{ id, type, complexId, propertyId, params, createdAt }]
};
