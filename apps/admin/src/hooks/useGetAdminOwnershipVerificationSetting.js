import { useEffect, useState } from 'react';
import { getAdminOwnershipVerificationSetting } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

// 권리자 인증 유효기간(GET /admin/settings/ownership-verification). data = { validityYears, updatedAt }.
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetAdminOwnershipVerificationSetting = ({ onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const data = await getAdminOwnershipVerificationSetting();
        if (!ignore) setState({ data, error: null, isLoading: false });
      } catch (error) {
        if (ignore) return;
        if (isUnauthorizedError(error)) {
          onUnauthorized?.();
          return;
        }
        setState({ data: null, error: toApiError(error), isLoading: false });
      }
    };
    load();

    return () => {
      ignore = true;
    };
  }, [reloadCount, onUnauthorized]);

  return { ...state, refetch: () => setReloadCount((count) => count + 1) };
};
