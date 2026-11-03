import axiosInstance from '../../axios/axiosInstance';

// body: { name, jibunAddress, roadAddress, legalDongCode, sourceKey } — 검색되지 않는 단지를 직접 등록한다.
// sourceKey를 비우면 서버가 만든다. 응답은 단지 상세와 같은 모양
export const postAdminComplex = async (body) => {
  const { data } = await axiosInstance.post('/admin/complexes', body);
  return data.data;
};
