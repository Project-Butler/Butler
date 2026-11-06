import { getAdminOwnershipVerificationAttemptList } from '@butler/api-client';
import { useCursorList } from './useCursorList';

// 권리자 인증 시도 최근 순(GET /admin/ownership-verification-attempts). data = { items, meta: { nextCursor, hasNext } }.
// params: { status?, reasonCode?, ownershipId?, size }
export const useGetAdminOwnershipVerificationAttemptList = ({ size = 30, ...filters } = {}, { onUnauthorized } = {}) =>
  useCursorList(getAdminOwnershipVerificationAttemptList, { ...filters, size }, { onUnauthorized });
