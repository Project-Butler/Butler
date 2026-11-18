import { useCallback, useEffect, useRef, useState } from 'react';
import { getNotificationPreference, patchNotificationPreference } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';

// 내 알림 설정(GET·PATCH /notification-preferences). data = { webPushEnabled, mutedTypes }.
// updateMutedTypes(next)는 화면을 먼저 바꾸고 저장한다. 저장에 실패하면 되돌리고 saveError 를 채운다.
export const useNotificationPreference = ({ onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [saveError, setSaveError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const latest = useRef(null);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const data = await getNotificationPreference();
        if (ignore) return;
        latest.current = data;
        setState({ data, error: null, isLoading: false });
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
  }, [onUnauthorized]);

  const updateMutedTypes = useCallback(
    async (mutedTypes) => {
      const previous = latest.current;
      if (!previous) return;
      const optimistic = { ...previous, mutedTypes };
      latest.current = optimistic;
      setState((prev) => ({ ...prev, data: optimistic }));
      setSaveError(null);
      setIsSaving(true);
      try {
        const saved = await patchNotificationPreference({ mutedTypes });
        latest.current = saved;
        setState((prev) => ({ ...prev, data: saved }));
      } catch (error) {
        latest.current = previous;
        setState((prev) => ({ ...prev, data: previous }));
        if (isUnauthorizedError(error)) {
          onUnauthorized?.();
          return;
        }
        setSaveError(toApiError(error));
      } finally {
        setIsSaving(false);
      }
    },
    [onUnauthorized],
  );

  return { ...state, isSaving, saveError, updateMutedTypes };
};
