import axiosInstance from '../../axios/axiosInstance';

// 오래 걸리는 작업 상태(요청한 사용자 본인·ADMIN만). { id, type, status, result, error, ... }
export const getJob = async (jobId) => {
  const { data } = await axiosInstance.get(`/jobs/${jobId}`);
  return data.data;
};
