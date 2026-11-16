import axiosInstance from '../../axios/axiosInstance';

export const getThread = async (threadId) => {
  const { data } = await axiosInstance.get(`/threads/${threadId}`);
  return data.data;
};
