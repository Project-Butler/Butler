import axiosInstance from '../../axios/axiosInstance';

// params: { propertyId?, scope?, type?('REPAIR,NOTE'처럼 쉼표), room?('KITCHEN,NONE'), q?(검색어), from?·until?('YYYY-MM-DD', 그날 포함, from > until은 400), sort?('occurredOn:desc'), page, size }
export const getManagementLogList = async (params) => {
  const { data } = await axiosInstance.get('/management-logs', { params });
  return data; // { data: [...], meta: { page, size, total, hasNext } }
};
