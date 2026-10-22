import axiosInstance from '../../axios/axiosInstance';

export const getLandlordBuilding = async (landlordBuildingId) => {
  const { data } = await axiosInstance.get(`/landlord-buildings/${landlordBuildingId}`);
  return data.data;
};
