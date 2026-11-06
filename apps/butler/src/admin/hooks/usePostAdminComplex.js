import { postAdminComplex } from '@butler/api-client';
import { useMutationRequest } from './useMutationRequest';

// 단지 직접 등록(POST /admin/complexes). mutate(body) → data = 만든 단지(단지 상세와 같은 모양).
export const usePostAdminComplex = ({ onUnauthorized } = {}) => useMutationRequest(postAdminComplex, { onUnauthorized });
