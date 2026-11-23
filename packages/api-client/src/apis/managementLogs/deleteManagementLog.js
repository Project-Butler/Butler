import axiosInstance from '../../axios/axiosInstance';

// 지울 수 있는지는 응답의 isDeletable. 작성자는 인증 상태면 호실 이력도 지운다. 인증이 끊기면 403,
// 소유가 끝난 호실의 호실 이력·시스템 기록은 422 MANAGEMENT_LOG_NOT_DELETABLE.
export const deleteManagementLog = async (logId) => {
  await axiosInstance.delete(`/management-logs/${logId}`);
};
