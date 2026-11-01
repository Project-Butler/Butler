import axiosInstance from '../../axios/axiosInstance';

// params: { actorId?, action?, resourceType?, resourceId?, from?, to?, cursor?, size }
export const getAdminAuditLogList = async (params) => {
  const { data } = await axiosInstance.get('/admin/audit-logs', { params });
  return data; // { data: [...], meta: { nextCursor, hasNext } }
};
