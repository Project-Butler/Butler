import { useMemo } from 'react';
import { buildHomeRows, computeAllHomesAxis } from '../utils/houseLogTimeline';
import { useGetAllManagementLogList } from './useGetAllManagementLogList';
import { useGetContractList } from './useGetContractList';
import { useGetPropertyOwnershipList } from './useGetPropertyOwnershipList';

const LIST_SIZE = 100;

// 전체 호실 타임라인 데이터(H-28). 요청: 내 소유 관계 목록 1 · 내 계약 목록 1(끝난 소유 포함) · 모든 호실 기록(축 시작부터 끝까지).
// homes: 호실 목록(지금 소유 + 예전 소유, 목록에서 지운 호실은 서버가 이미 뺌). filter: { types, rooms } — 점만 줄인다.
export const useAllHomesTimeline = ({ homes, filter, today, reloadKey }, { onUnauthorized } = {}) => {
  const hookOptions = { onUnauthorized };
  const ownerships = useGetPropertyOwnershipList({ size: LIST_SIZE }, hookOptions);
  const contracts = useGetContractList({ includeEndedOwnership: true, size: LIST_SIZE }, hookOptions);
  const isReady = Boolean(ownerships.data && contracts.data);

  // 축은 계약 막대로만 정해지므로 기록 없이 먼저 계산해 그 시작부터 기록을 읽는다.
  const axis = useMemo(
    () =>
      computeAllHomesAxis(
        buildHomeRows({ homes, ownerships: ownerships.data?.items, contracts: contracts.data?.items, today }),
        today,
      ),
    [homes, ownerships.data, contracts.data, today],
  );
  const logs = useGetAllManagementLogList({ from: axis.start, enabled: isReady, reloadKey }, hookOptions);

  const rows = useMemo(
    () => buildHomeRows({ homes, ownerships: ownerships.data?.items, contracts: contracts.data?.items, logs: logs.data ?? [], filter, today }),
    [homes, ownerships.data, contracts.data, logs.data, filter, today],
  );

  return {
    isLoading: !isReady || logs.isLoading || !logs.data,
    error: ownerships.error ?? contracts.error ?? logs.error ?? null,
    axis,
    rows,
  };
};
