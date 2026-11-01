import axiosInstance from '../../axios/axiosInstance';

export const getContract = async (contractId) => {
  const { data } = await axiosInstance.get(`/contracts/${contractId}`);
  return data.data;
};
