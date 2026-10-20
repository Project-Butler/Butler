import axiosInstance from '../../axios/axiosInstance';

// body: { name?, capacity?, memo? } — 정원이 등록 호실 수보다 작으면 422 LANDLORD_BUILDING_CAPACITY_BELOW_UNITS
export const patchLandlordBuilding = async (landlordBuildingId, body) => {
  const { data } = await axiosInstance.patch(`/landlord-buildings/${landlordBuildingId}`, body);
  return data.data;
};
