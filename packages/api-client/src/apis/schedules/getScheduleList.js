import axiosInstance from '../../axios/axiosInstance';

// params: { fromDate: 'YYYY-MM-DD', toDate: 'YYYY-MM-DD' } — 양끝 포함 최대 93일, 페이지 없음.
// 지금은 계약에서 계산한 SYSTEM 일정(CONTRACT_END·RENT_PAYMENT·RENEWAL_NOTICE_DEADLINE)만 온다.
export const getScheduleList = async (params) => {
  const { data } = await axiosInstance.get('/schedules', { params });
  return data.data;
};
