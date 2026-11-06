import { deleteManagementLog } from '@butler/api-client';
import { useManagementLogMutation } from './useManagementLogMutation';

// 관리 로그 삭제(DELETE /management-logs/:logId). mutate(logId)
export const useDeleteManagementLog = (options) => useManagementLogMutation(deleteManagementLog, options);
