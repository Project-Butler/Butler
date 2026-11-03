import axiosInstance from '../../axios/axiosInstance';

// params: { propertyId?, scope?, type?('REPAIR,NOTE'처럼 쉼표), until?('YYYY-MM-DD'), sort?('occurredOn:desc'), page, size }
export const getManagementLogList = async (params) => {
  const { data } = await axiosInstance.get('/management-logs', { params });
  return data; // { data: [...], meta: { page, size, total, hasNext } }
};
