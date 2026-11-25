import { postManagementLog } from '@butler/api-client';
import { useManagementLogMutation } from './useManagementLogMutation';

// 하우스 로그 작성(POST /properties/:propertyId/management-logs). mutate(propertyId, body)
export const usePostManagementLog = (options) => useManagementLogMutation(postManagementLog, options);
