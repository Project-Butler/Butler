import { useMemo } from 'react';
import { getOwnershipVerificationRenewalTargetList, getPropertyOwnershipList, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';
import { toRenewalNotices } from '../utils/ownershipVerification';

// 활성 소유 관계를 한 번에 최대 100건 받아 같은 법정동의 다른 호실을 찾는다. 넘는 호실은 없는 것으로 보아 커뮤니티 문장을 남긴다.
const OWNERSHIP_LIST_SIZE = 100;

const EMPTY = { targets: [], activeOwnerships: [] };

// 재인증 안내 목록(GET /ownership-verifications/renewal-targets). 대상이 있을 때만 내 활성 소유 관계도 읽는다.
// notices: 만료 30일 이내·만료된 호실의 안내(utils/ownershipVerification toRenewalNotices).
// 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetOwnershipRenewalNoticeList = ({ verifiedLegalDongCodes }, { onUnauthorized } = {}) => {
  const { data, error, refetch } = useApiQuery({
    queryKey: [queryKey.OWNERSHIP_RENEWAL_NOTICES],
    queryFn: async () => {
      const targets = await getOwnershipVerificationRenewalTargetList();
      const activeOwnerships =
        targets.length > 0 ? (await getPropertyOwnershipList({ active: 'true', page: 1, size: OWNERSHIP_LIST_SIZE })).data : [];
      return { targets, activeOwnerships };
    },
    onUnauthorized,
  });

  const { targets, activeOwnerships } = data ?? EMPTY;
  const notices = useMemo(
    () => toRenewalNotices(targets, { verifiedLegalDongCodes, activeOwnerships }),
    [targets, activeOwnerships, verifiedLegalDongCodes],
  );

  return { notices, error, refetch };
};
