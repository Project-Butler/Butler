import axiosInstance from '../../axios/axiosInstance';

// 우리 단지 뉴스(단지 이름이 제목에 들어간 기사). params: { complexId, page, size }
export const getCommunityComplexNewsList = async ({ complexId, ...params }) => {
  const { data } = await axiosInstance.get(`/community/complexes/${complexId}/news`, { params });
  // { data: [{ id, scope: 'COMPLEX', title, url, publisher, publishedAt }],
  //   meta: { page, size, total, hasNext, complex: { id, name, legalDongCode } } }
  return data;
};
