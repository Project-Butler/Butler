import axiosInstance from '../../axios/axiosInstance';

// params: { buildingNo, unitNo }
export const getComplexUnitInfo = async (complexId, params) => {
  const { data } = await axiosInstance.get(`/complexes/${complexId}/unit-info`, { params });
  return data.data;
};
