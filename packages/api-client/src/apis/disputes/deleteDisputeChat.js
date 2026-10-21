import axiosInstance from '../../axios/axiosInstance';

export const deleteDisputeChat = async (chatId) => {
  await axiosInstance.delete(`/disputes/chats/${chatId}`);
};
