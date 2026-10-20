import axiosInstance from '../../axios/axiosInstance';

// params: { page, size }
export const getLandlordBuildingList = async (params) => {
  const { data } = await axiosInstance.get('/landlord-buildings', { params });
  return data; // { data: [...], meta: { page, size, total, hasNext } }
};
