import axiosInstance from '../../axios/axiosInstance';

// params: { propertyId?, status?('OPEN,IN_PROGRESS'처럼 쉼표), category?, room?('KITCHEN,NONE'), sort?('createdAt:desc'), page, size }
export const getTicketList = async (params) => {
  const { data } = await axiosInstance.get('/tickets', { params });
  return data; // { data: [...], meta: { page, size, total, hasNext } }
};
