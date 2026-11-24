import { useMemo } from 'react';
import { addDays } from '../utils/contract';
import { classifyContracts, computeAxis, computeOwnerBand, mergeLogsById, pickOwnership, toDateOnly } from '../utils/houseLogTimeline';
import { useGetAllManagementLogList } from './useGetAllManagementLogList';
import { useGetContractList } from './useGetContractList';
import { useGetPropertyOwnershipList } from './useGetPropertyOwnershipList';
import { useGetRenewalNoticeList } from './useGetRenewalNoticeList';

// 임대인 한 명의 소유 관계·계약은 수가 적어(호실 2~5개) 한 번에 100건 읽는다.
const LIST_SIZE = 100;

// 한 호실 계약 타임라인 데이터(#203 P-4b, 계획 2장 P-4b 데이터 훅).
// 요청: 내 소유 관계 목록 1 · 내 계약 목록 1(끝난 소유 포함) · 지금 계약 통지 기록 1 · 기록(축 시작부터 끝까지) · 이전 소유 기록(H-30, 인증한 호실만).
// - 내 소유 시작 = 소유 관계 firstVerifiedAt(응답에 없으면 verifiedAt). 인증 전이면 이전 소유 띠가 없다.
// - 이전 소유 기록: scope=PROPERTY_HISTORY&until=소유 시작 전날을 끝까지 읽어 isFromPreviousOwner만 센다(meta.total을 쓰지 않음).
// reloadKey가 바뀌면 기록을 다시 읽는다(기록 추가·삭제 뒤).
export const useHouseLogTimeline = ({ propertyId, today, reloadKey }, { onUnauthorized } = {}) => {
  const hookOptions = { onUnauthorized };
  const ownerships = useGetPropertyOwnershipList({ size: LIST_SIZE }, hookOptions);
  const contracts = useGetContractList({ includeEndedOwnership: true, size: LIST_SIZE }, hookOptions);

  const ownership = ownerships.data ? pickOwnership(ownerships.data.items, propertyId) : null;
  const endedOn = ownership?.endedAt ? toDateOnly(ownership.endedAt) : null;
  const ownContracts = useMemo(
    () => (contracts.data?.items ?? []).filter((contract) => ownership && contract.ownershipId === ownership.id),
    [contracts.data, ownership],
  );
  const split = useMemo(() => classifyContracts(ownContracts, { ownershipEndedOn: endedOn, today }), [ownContracts, endedOn, today]);
  // 지금 계약이 없으면 만료된 마지막 계약(lapsed)의 통지 기록을 읽어 묵시적 갱신 안내에 쓴다(C5).
  const notices = useGetRenewalNoticeList(split.current?.id ?? split.lapsed?.id, hookOptions);

  const verifiedAt = ownership?.firstVerifiedAt ?? ownership?.verifiedAt ?? null;
  const myStart = verifiedAt ? toDateOnly(verifiedAt) : null;
  const needsInherited = Boolean(myStart) && !endedOn;
  const inherited = useGetAllManagementLogList(
    { propertyId, scope: 'PROPERTY_HISTORY', until: myStart ? addDays(myStart, -1) : undefined, enabled: needsInherited, reloadKey },
    hookOptions,
  );
  const band = useMemo(() => (inherited.data ? computeOwnerBand({ myStart, inheritedLogs: inherited.data }) : null), [inherited.data, myStart]);

  const isReady = Boolean(ownerships.data && contracts.data);
  const baseAxis = useMemo(() => computeAxis({ ...split, today, ownershipEndedOn: endedOn }), [split, today, endedOn]);
  const axis = useMemo(() => computeAxis({ ...split, band, today, ownershipEndedOn: endedOn }), [split, band, today, endedOn]);
  const main = useGetAllManagementLogList({ propertyId, from: baseAxis.start, enabled: isReady, reloadKey }, hookOptions);

  const logs = useMemo(() => {
    const inBand = band ? (inherited.data ?? []).filter((log) => log.isFromPreviousOwner && log.occurredOn >= band.start) : [];
    return mergeLogsById(main.data ?? [], inBand);
  }, [main.data, inherited.data, band]);

  const error = ownerships.error ?? contracts.error ?? main.error ?? inherited.error ?? notices.error ?? null;
  // 켜진 직후 한 번은 아직 요청 전이라 isLoading이 false다. 받은 데이터가 없으면 불러오는 중으로 본다.
  const isLoading = !isReady || main.isLoading || !main.data || (needsInherited && (inherited.isLoading || !inherited.data));

  return {
    isLoading,
    error,
    ownership,
    endedOn,
    isSold: ownership?.endReason === 'SOLD',
    ...split,
    band,
    axis,
    hiddenPastCount: axis.hiddenPastCount,
    logs,
    notices: split.current ? (notices.data ?? []) : [],
    lapsedNotices: !split.current && split.lapsed ? (notices.data ?? []) : [],
  };
};
