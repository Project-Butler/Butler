import axiosInstance from '../../axios/axiosInstance';

// 204(본문 없음)
export const postNotificationReadAll = async () => {
  await axiosInstance.post('/notifications/read-all');
};
