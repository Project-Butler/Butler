import axiosInstance from '../../axios/axiosInstance';

// body: { scope?, type, title, content?, occurredOn, cost? }. 호실 이력(PROPERTY_HISTORY)은 인증 소유자만(403)
export const postManagementLog = async (propertyId, body) => {
  const { data } = await axiosInstance.post(`/properties/${propertyId}/management-logs`, body);
  return data.data;
};
