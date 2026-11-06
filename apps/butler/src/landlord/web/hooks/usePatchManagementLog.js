import { patchManagementLog } from '@butler/api-client';
import { useManagementLogMutation } from './useManagementLogMutation';

// 관리 로그 수정(PATCH /management-logs/:logId). mutate(logId, body)
export const usePatchManagementLog = (options) => useManagementLogMutation(patchManagementLog, options);
