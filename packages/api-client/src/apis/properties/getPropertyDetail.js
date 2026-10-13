import axiosInstance from '../../axios/axiosInstance';

export const getPropertyDetail = async (propertyId) => {
  const { data } = await axiosInstance.get(`/api/properties/${propertyId}`);
  return data;
};
