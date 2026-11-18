import axiosInstance from '../../axios/axiosInstance';

// 내 알림 설정. 처음이면 기본값 { webPushEnabled: true, mutedTypes: [] }.
export const getNotificationPreference = async () => {
  const { data } = await axiosInstance.get('/notification-preferences');
  return data.data; // { webPushEnabled, mutedTypes }
};
