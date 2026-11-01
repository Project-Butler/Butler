import axiosInstance from '../../axios/axiosInstance';

export const getManagementLog = async (logId) => {
  const { data } = await axiosInstance.get(`/management-logs/${logId}`);
  return data.data;
};
