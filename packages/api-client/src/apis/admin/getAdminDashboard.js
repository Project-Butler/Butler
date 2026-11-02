import axiosInstance from '../../axios/axiosInstance';

// { users, ownerships, contracts, tickets, jobs } 요약 카운트
export const getAdminDashboard = async () => {
  const { data } = await axiosInstance.get('/admin/dashboard');
  return data.data;
};
