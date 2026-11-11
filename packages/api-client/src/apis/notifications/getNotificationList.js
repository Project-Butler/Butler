import axiosInstance from '../../axios/axiosInstance';

// params: { size?, unreadOnly?, cursor? } — 커서 방식. 본인 알림만
export const getNotificationList = async ({ size, unreadOnly, cursor } = {}) => {
  const { data } = await axiosInstance.get('/notifications', { params: { size, unreadOnly, cursor } });
  return data; // { data: [...], meta: { nextCursor, hasNext ... } }
};
