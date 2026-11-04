import { patchAdminOwnershipVerificationSetting } from '@butler/api-client';
import { useMutationRequest } from './useMutationRequest';

// 권리자 인증 유효기간 수정(PATCH /admin/settings/ownership-verification). mutate({ validityYears }).
export const usePatchAdminOwnershipVerificationSetting = ({ onUnauthorized } = {}) =>
  useMutationRequest(patchAdminOwnershipVerificationSetting, { onUnauthorized });
