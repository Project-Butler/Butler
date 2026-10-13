import axiosInstance from '../../axios/axiosInstance';

export const getPropertyList = async ({ ownerId } = {}) => {
  const { data } = await axiosInstance.get('/api/properties', { params: { ownerId } });
  return data;
};
