import axiosInstance from '../../axios/axiosInstance';

// body: { complexId, name, capacity?, memo? } — 같은 단지에 이미 있으면 409 LANDLORD_BUILDING_ALREADY_EXISTS
export const postLandlordBuilding = async (body) => {
  const { data } = await axiosInstance.post('/landlord-buildings', body);
  return data.data;
};
