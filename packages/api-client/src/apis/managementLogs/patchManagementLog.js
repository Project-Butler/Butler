import axiosInstance from '../../axios/axiosInstance';

// body: { type?, room?(null = 방 없음), title?, content?, occurredOn?, cost? }. 공개 범위는 바꿀 수 없다.
export const patchManagementLog = async (logId, body) => {
  const { data } = await axiosInstance.patch(`/management-logs/${logId}`, body);
  return data.data;
};
