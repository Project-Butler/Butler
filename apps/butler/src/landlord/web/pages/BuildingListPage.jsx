import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { Button } from '@butler/ui';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { IconTile } from '../components/IconTile/IconTile';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { OwnershipTabs } from '../components/OwnershipTabs/OwnershipTabs';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { UnitCard } from '../components/UnitCard/UnitCard';
import { useGetContractList } from '../hooks/useGetContractList';
import { useGetManagementLogList } from '../hooks/useGetManagementLogList';
import { useGetPropertyList } from '../hooks/useGetPropertyList';
import { useGetPropertyOwnershipList } from '../hooks/useGetPropertyOwnershipList';
import { getTodayKST } from '../utils/contract';
import { getLatestPastLog, getNeededAction, getNextEvent, groupByProperty, pickCardContract } from '../utils/unitCard';

const UNIT_PAGE_SIZE = 20;
// 카드에 붙일 계약·소유 관계·관리 로그는 한 번에 받는다(목록 API 최대 크기). 임대인 호실은 평균 2~3, 많아야 5개다.
const JOIN_SIZE = 100;
// 호실이 이 수보다 적으면 마지막에 점선 "부동산 등록" 카드를 둔다.
const ADD_CARD_LIMIT = 5;

const RegisterButton = ({ onClick }) => (
  <Button size="h44" onClick={onClick}>
    <Plus size={16} className="-ml-0.5 mr-1.5 inline-block" />
    부동산 등록
  </Button>
);

// 내 부동산(현재 소유): 호실을 '단지 동 호' 한 장씩 카드로(#41). 같은 단지라도 따로. 카드를 누르면 호실 상세.
// 카드 칸: 상태 칩 · 방 구성·면적·층(값 있는 것만) · 임차인·금액 · 다음 일정 · 해야 할 행동 1개(utils/unitCard).
// params.notice: 등록 직후 안내(이미 등록된 면적·층을 썼을 때 등).
export const BuildingListPage = ({ params, onNavigate, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const [page, setPage] = useState(1);
  const units = useGetPropertyList({ relation: 'OWNER', page, size: UNIT_PAGE_SIZE }, hookOptions);
  const formerCount = useGetPropertyList({ relation: 'FORMER_OWNER', size: 1 }, hookOptions);
  const contracts = useGetContractList(
    { status: 'UPCOMING,ACTIVE,EXPIRING_SOON', sort: 'endDate:asc', size: JOIN_SIZE, activeOwnership: 'true' },
    hookOptions,
  );
  const ownerships = useGetPropertyOwnershipList({ active: 'true', size: JOIN_SIZE }, hookOptions);
  const logs = useGetManagementLogList({ size: JOIN_SIZE }, hookOptions);

  const today = getTodayKST();
  const unitItems = units.data?.items ?? [];
  const contractsByProperty = groupByProperty(contracts.data?.items ?? [], (contract) => contract.property.id);
  const ownershipByProperty = new Map((ownerships.data?.items ?? []).map((ownership) => [ownership.property.id, ownership]));
  const logsByProperty = groupByProperty(logs.data?.items ?? [], (log) => log.property.id);
  const isReady = Boolean(units.data);
  const goRegister = () => onNavigate('propertyRegister');
  const counts = { OWNER: units.data?.meta.total, FORMER_OWNER: formerCount.data?.meta.total };

  return (
    <div className="buildings-page w-full space-y-5 pb-10">
      <PageHeader
        title="내 부동산"
        description={
          isReady ? `호실 ${units.data.meta.total}채 · 카드를 누르면 계약·기록·인증을 한곳에서 봐요.` : '단지와 호실을 한눈에 보고 관리해요.'
        }
        actions={
          <>
            <OwnershipTabs active="OWNER" counts={counts} onNavigate={onNavigate} />
            <RegisterButton onClick={goRegister} />
          </>
        }
      />

      {params.notice && <NoticeBox tone="info">{params.notice}</NoticeBox>}
      {units.error && !isReady && <NoticeBox>{units.error.message}</NoticeBox>}
      {!units.error && !isReady && (
        <p role="status" className="py-10 text-center text-body text-ink-3">
          불러오는 중입니다
        </p>
      )}

      {isReady && unitItems.length === 0 && (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={Building2}
            title="등록한 부동산이 없습니다"
            description="주소와 동·호를 입력해 첫 부동산을 등록해 보세요."
            action={<RegisterButton onClick={goRegister} />}
          />
        </div>
      )}

      {isReady && unitItems.length > 0 && (
        <section className="buildings-page__card-grid grid grid-cols-3 gap-5" aria-label="호실">
          {unitItems.map((property) => {
            const contract = pickCardContract(contractsByProperty.get(property.id) ?? []);
            const ownership = ownershipByProperty.get(property.id) ?? null;
            const propertyLogs = logsByProperty.get(property.id) ?? [];
            return (
              <UnitCard
                key={property.id}
                property={property}
                contract={contract}
                ownership={ownership}
                nextEvent={getNextEvent({ contract, ownership, logs: propertyLogs, today })}
                action={ownership ? getNeededAction({ property, contract, ownership }) : null}
                latestLog={getLatestPastLog(propertyLogs, today)}
                today={today}
                onNavigate={onNavigate}
              />
            );
          })}
          {units.data.meta.total < ADD_CARD_LIMIT && (
            <button
              type="button"
              onClick={goRegister}
              className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-dash text-ink-3 transition-colors hover:border-accent hover:text-accent"
            >
              <IconTile icon={Plus} tone="mute" size="lg" />
              <span className="text-body font-semibold">부동산 등록</span>
              <span className="text-sub">주소와 동·호만 입력하면 돼요</span>
            </button>
          )}
        </section>
      )}

      {[contracts.error, ownerships.error, logs.error].filter(Boolean).slice(0, 1).map((error) => (
        <NoticeBox key="join-error">{error.message}</NoticeBox>
      ))}
      {isReady && units.data.meta.hasNext && (
        // 다음 페이지 로드가 실패했으면 page는 이미 N이므로 N+1로 건너뛰지 않고 같은 페이지를 다시 불러온다.
        <div className="text-center">
          <Button variant="secondary" disabled={units.isLoading} onClick={() => (units.error ? units.refetch() : setPage((prev) => prev + 1))}>
            {units.isLoading ? '불러오는 중' : units.error ? '다시 시도' : '더 보기'}
          </Button>
        </div>
      )}
    </div>
  );
};
