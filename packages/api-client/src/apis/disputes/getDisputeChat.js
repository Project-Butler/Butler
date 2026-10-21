import axiosInstance from '../../axios/axiosInstance';

export const getDisputeChat = async (chatId) => {
  const { data } = await axiosInstance.get(`/disputes/chats/${chatId}`);
  return data.data; // { id, title, createdAt, updatedAt, messages: [{ id, role, content, references, createdAt }] }
};
