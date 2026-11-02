import axiosInstance from '../../axios/axiosInstance';

// 이어서 질문한다. 새로 생긴 [질문, 답변] 두 메시지를 돌려준다.
export const postDisputeChatMessage = async ({ chatId, message }) => {
  const { data } = await axiosInstance.post(`/disputes/chats/${chatId}/messages`, { message });
  return data.data;
};
