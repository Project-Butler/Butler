import axiosInstance from '../../axios/axiosInstance';

// 204(본문 없음). 그 단지에 내 호실이 있으면 409 LANDLORD_BUILDING_HAS_PROPERTIES
export const deleteLandlordBuilding = async (landlordBuildingId) => {
  await axiosInstance.delete(`/landlord-buildings/${landlordBuildingId}`);
};
