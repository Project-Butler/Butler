import axiosInstance from '../../axios/axiosInstance';

// K-apt 최신 기본정보 엑셀을 지금 넣는다(본문 없음). 이미 갱신 중이면 409 REFERENCE_DATA_REFRESH_IN_PROGRESS
export const postAdminKaptRefresh = async () => {
  const { data } = await axiosInstance.post('/admin/reference-data/kapt/refresh');
  return data.data; // 결과 요약
};
