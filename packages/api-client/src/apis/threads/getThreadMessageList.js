import axiosInstance from '../../axios/axiosInstance';

// params: { cursor?, size? } 지난 메시지(최신순) 또는 { after, size? } 새 메시지(오래된 순, 10초 폴링 권장).
export const getThreadMessageList = async (threadId, params) => {
  const { data } = await axiosInstance.get(`/threads/${threadId}/messages`, { params });
  return data; // { data: [...], meta: { nextCursor, hasNext } }
};
