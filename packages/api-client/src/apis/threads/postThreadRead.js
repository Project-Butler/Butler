import axiosInstance from '../../axios/axiosInstance';

// 204. 읽은 위치는 앞으로만 옮겨진다.
export const postThreadRead = async (threadId, lastReadMessageId) => {
  await axiosInstance.post(`/threads/${threadId}/read`, { lastReadMessageId });
};
