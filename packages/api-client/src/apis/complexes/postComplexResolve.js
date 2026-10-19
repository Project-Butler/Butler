import axiosInstance from '../../axios/axiosInstance';

// body: { sourceKey }
export const postComplexResolve = async (body) => {
  const { data } = await axiosInstance.post('/complexes/resolve', body);
  return data.data;
};
