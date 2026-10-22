import axiosInstance from '../../axios/axiosInstance';

export const getComplex = async (complexId) => {
  const { data } = await axiosInstance.get(`/complexes/${complexId}`);
  return data.data;
};
