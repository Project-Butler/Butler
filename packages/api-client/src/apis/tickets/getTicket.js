import axiosInstance from '../../axios/axiosInstance';

export const getTicket = async (ticketId) => {
  const { data } = await axiosInstance.get(`/tickets/${ticketId}`);
  return data.data;
};
