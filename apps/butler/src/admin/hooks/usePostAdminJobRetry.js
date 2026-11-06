import { postAdminJobRetry } from '@butler/api-client';
import { useMutationRequest } from './useMutationRequest';

// FAILED 작업 재시도(POST /admin/jobs/:jobId/retry). mutate(jobId) → data = { jobId, status: 'PENDING' }.
export const usePostAdminJobRetry = ({ onUnauthorized } = {}) => useMutationRequest(postAdminJobRetry, { onUnauthorized });
