import axiosInstance from '../../axios/axiosInstance';

// 분쟁 해결사 자주 묻는 질문. params: { category, q } — 여러 유형은 쉼표로(GENERAL,PREMIUM), 없으면 전체
export const getDisputeFaqList = async (params) => {
  const { data } = await axiosInstance.get('/disputes/faqs', { params });
  return data.data; // [{ key, category, question, answer, references: [{ id, type, category, title }] }]
};
