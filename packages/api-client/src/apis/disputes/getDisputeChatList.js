import axiosInstance from '../../axios/axiosInstance';

// params: { page, size }
export const getDisputeChatList = async (params) => {
  const { data } = await axiosInstance.get('/disputes/chats', { params });
  return data; // { data: [{ id, title, createdAt, updatedAt }], meta: { page, size, total, hasNext } }
};
