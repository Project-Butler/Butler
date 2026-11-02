import axiosInstance from '../../axios/axiosInstance';

// params: { page, size, includeDeleted? } — includeDeleted: true면 숨긴(삭제한) 건물도(deletedAt 채워짐)
export const getLandlordBuildingList = async (params) => {
  const { data } = await axiosInstance.get('/landlord-buildings', { params });
  return data; // { data: [...], meta: { page, size, total, hasNext } }
};
