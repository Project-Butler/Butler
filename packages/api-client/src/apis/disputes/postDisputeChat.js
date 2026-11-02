import axiosInstance from '../../axios/axiosInstance';

// 새 상담 대화를 시작한다. 첫 질문의 답변까지 받아서 대화 전체를 돌려준다.
export const postDisputeChat = async ({ message }) => {
  const { data } = await axiosInstance.post('/disputes/chats', { message });
  return data.data; // getDisputeChat과 같은 모양
};
