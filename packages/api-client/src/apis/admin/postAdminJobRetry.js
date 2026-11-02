import axiosInstance from '../../axios/axiosInstance';

// FAILED 작업을 PENDING으로 되돌린다(202). FAILED가 아니면 422 JOB_NOT_RETRYABLE
export const postAdminJobRetry = async (jobId) => {
  const { data } = await axiosInstance.post(`/admin/jobs/${jobId}/retry`);
  return data.data; // { jobId, status: 'PENDING' }
};
