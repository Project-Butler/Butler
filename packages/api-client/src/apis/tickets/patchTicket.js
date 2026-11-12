import axiosInstance from '../../axios/axiosInstance';

// body: 요청자 { title?, description? (OPEN일 때만), status?: 'CANCELED' }
//       임대인 { status?('IN_PROGRESS'|'DONE'|'CANCELED'), resolutionNote?, cost? }
export const patchTicket = async (ticketId, body) => {
  const { data } = await axiosInstance.patch(`/tickets/${ticketId}`, body);
  return data.data;
};
