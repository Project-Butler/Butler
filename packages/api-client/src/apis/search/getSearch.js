import axiosInstance from '../../axios/axiosInstance';

// GET /search (계약 7장 v1.1). params: { query, types? } — query는 2~50자, types는 SearchType을 쉼표로 이은 문자열(생략하면 전부).
// 응답: { properties, contracts, tickets, managementLogs, documents, schedules } — 유형별 최대 10건, 볼 수 없는 유형은 [].
export const getSearch = async (params) => {
  const { data } = await axiosInstance.get('/search', { params });
  return data.data;
};
