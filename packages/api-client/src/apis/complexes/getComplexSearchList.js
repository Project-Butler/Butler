import axiosInstance from '../../axios/axiosInstance';

// params: { query, size }
export const getComplexSearchList = async (params) => {
  const { data } = await axiosInstance.get('/complexes/search', { params });
  return data.data;
};
