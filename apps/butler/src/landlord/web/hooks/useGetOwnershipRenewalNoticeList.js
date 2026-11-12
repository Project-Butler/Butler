import { useCallback, useEffect, useMemo, useState } from 'react';
import { getOwnershipVerificationRenewalTargetList, getPropertyOwnershipList } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';
import { toRenewalNotices } from '../utils/ownershipVerification';

// 활성 소유 관계를 한 번에 최대 100건 받아 같은 법정동의 다른 호실을 찾는다. 넘는 호실은 없는 것으로 보아 커뮤니티 문장을 남긴다.
const OWNERSHIP_LIST_SIZE = 100;

// 재인증 안내 목록(GET /ownership-verifications/renewal-targets). 대상이 있을 때만 내 활성 소유 관계도 읽는다.
// notices: 만료 30일 이내·만료된 호실의 안내(utils/ownershipVerification toRenewalNotices).
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetOwnershipRenewalNoticeList = ({ verifiedLegalDongCodes }, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ targets: [], activeOwnerships: [], error: null });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      try {
        const targets = await getOwnershipVerificationRenewalTargetList();
        const activeOwnerships =
          targets.length > 0 ? (await getPropertyOwnershipList({ active: 'true', page: 1, size: OWNERSHIP_LIST_SIZE })).data : [];
        if (!ignore) setState({ targets, activeOwnerships, error: null });
      } catch (error) {
        if (ignore) return;
        if (isUnauthorizedError(error)) {
          onUnauthorized?.();
          return;
        }
        setState((prev) => ({ ...prev, error: toApiError(error) }));
      }
    };
    load();

    return () => {
      ignore = true;
    };
  }, [reloadCount, onUnauthorized]);

  const { targets, activeOwnerships, error } = state;
  const notices = useMemo(
    () => toRenewalNotices(targets, { verifiedLegalDongCodes, activeOwnerships }),
    [targets, activeOwnerships, verifiedLegalDongCodes],
  );
  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { notices, error, refetch };
};
