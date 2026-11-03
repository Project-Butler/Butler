import axiosInstance from '../../axios/axiosInstance';

// juso 참고 데이터를 지금 갱신한다(본문 없음). 이미 갱신 중이면 409 REFERENCE_DATA_REFRESH_IN_PROGRESS
export const postAdminJusoRefresh = async () => {
  const { data } = await axiosInstance.post('/admin/reference-data/juso/refresh');
  return data.data; // 결과 요약
};
