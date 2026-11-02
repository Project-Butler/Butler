import axiosInstance from '../../axios/axiosInstance';

export const getProperty = async (propertyId) => {
  const { data } = await axiosInstance.get(`/properties/${propertyId}`);
  return data.data;
};
