import axiosInstance from '../../axios/axiosInstance';

export const getNotificationUnreadCount = async () => {
  const { data } = await axiosInstance.get('/notifications/unread-count');
  return data.data; // { count }
};
