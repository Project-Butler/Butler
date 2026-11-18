import axiosInstance from '../../axios/axiosInstance';

// body: { webPushEnabled?: boolean, mutedTypes?: string[] } — 보낸 칸만 바뀐다. mutedTypes는 끌 알림 type의 최종 목록.
export const patchNotificationPreference = async (body) => {
  const { data } = await axiosInstance.patch('/notification-preferences', body);
  return data.data; // { webPushEnabled, mutedTypes }
};
