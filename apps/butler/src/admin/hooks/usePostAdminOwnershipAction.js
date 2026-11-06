import { postAdminOwnershipEnd, postAdminOwnershipRevoke } from '@butler/api-client';
import { useMutationRequest } from './useMutationRequest';

const REQUEST_BY_ACTION = { revoke: postAdminOwnershipRevoke, end: postAdminOwnershipEnd };

// action 'revoke'(인증 철회) | 'end'(운영자 종료)를 고른다.
const requestOwnershipAction = (action, ownershipId, body) => REQUEST_BY_ACTION[action](ownershipId, body);

// 소유 관계 철회·종료(POST /admin/property-ownerships/:id/revoke|end). mutate(action, ownershipId, { reason }).
export const usePostAdminOwnershipAction = ({ onUnauthorized } = {}) =>
  useMutationRequest(requestOwnershipAction, { onUnauthorized });
