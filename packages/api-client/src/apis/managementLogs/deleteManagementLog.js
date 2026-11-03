import axiosInstance from '../../axios/axiosInstance';

// 호실 이력은 지울 수 없다(422 MANAGEMENT_LOG_NOT_DELETABLE).
export const deleteManagementLog = async (logId) => {
  await axiosInstance.delete(`/management-logs/${logId}`);
};
