import axiosInstance from '../../axios/axiosInstance';

// 204(본문 없음)
export const postNotificationRead = async (notificationId) => {
  await axiosInstance.post(`/notifications/${notificationId}/read`);
};
