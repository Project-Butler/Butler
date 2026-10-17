import axiosInstance from '../../axios/axiosInstance';

export const getDisputeReference = async (referenceId) => {
  const { data } = await axiosInstance.get(`/disputes/references/${referenceId}`);
  return data.data;
};
