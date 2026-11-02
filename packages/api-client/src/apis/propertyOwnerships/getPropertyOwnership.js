import axiosInstance from '../../axios/axiosInstance';

export const getPropertyOwnership = async (ownershipId) => {
  const { data } = await axiosInstance.get(`/property-ownerships/${ownershipId}`);
  return data.data;
};
