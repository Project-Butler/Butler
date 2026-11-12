import { postAdminJusoRefresh, postAdminKaptRefresh } from '@butler/api-client';
import { useMutationRequest } from './useMutationRequest';

// 참고 데이터 즉시 갱신(POST /admin/reference-data/juso|kapt/refresh). 버튼마다 따로 써서 진행 상태가 섞이지 않게 한다.
export const usePostAdminJusoRefresh = ({ onUnauthorized } = {}) => useMutationRequest(postAdminJusoRefresh, { onUnauthorized });

export const usePostAdminKaptRefresh = ({ onUnauthorized } = {}) => useMutationRequest(postAdminKaptRefresh, { onUnauthorized });
