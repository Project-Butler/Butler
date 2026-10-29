import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Card, FilterChip } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useBuildingNames } from '../hooks/useBuildingNames';
import { useGetContractList } from '../hooks/useGetContractList';
import {
  CONTRACT_FILTERS,
  formatContractAmount,
  formatPeriod,
  getContractDdayBadge,
  getContractStatusBadge,
} from '../utils/contract';

const PAGE_SIZE = 20;

// 한 필터의 목록. 필터가 바뀌면 key로 새로 시작해 page가 1로 돌아간다. 정렬은 종료일 오름차순(D-17).
const ContractListSection = ({ filter, onNavigate, onUnauthorized }) => {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, refetch } = useGetContractList(
    { status: filter.status, sort: 'endDate:asc', page, size: PAGE_SIZE },
    { onUnauthorized },
  );
  const { getPropertyName } = useBuildingNames({ onUnauthorized });
  const items = data?.items ?? [];

  if (error && !data) return <NoticeBox>{error.message}</NoticeBox>;
  if (isLoading && !data) {
    return (
      <p role="status" className="py-10 text-center text-body text-ink-3">
        불러오는 중입니다
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-5 py-16 text-center">
        <p className="text-card font-semibold text-ink">
          {filter.key === 'all' ? '등록한 계약이 없습니다' : `${filter.label} 계약이 없습니다`}
        </p>
        {filter.key === 'all' && <Button onClick={() => onNavigate('contractRegister')}>계약 등록</Button>}
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-section font-semibold text-ink">{filter.label} 계약</h2>
        <span className="font-num text-sub tabular-nums text-ink-3">{data.meta.total}건</span>
      </div>
      <table className="w-full text-body">
        <thead>
          <tr className="border-y border-line bg-surface-2 text-left text-chip text-ink-3">
            <th className="px-5 py-2.5 font-medium">호실</th>
            <th className="px-3 py-2.5 font-medium">상태</th>
            <th className="px-3 py-2.5 font-medium">보증금 / 월세</th>
            <th className="px-3 py-2.5 font-medium">임차인</th>
            <th className="px-5 py-2.5 font-medium">기간</th>
          </tr>
        </thead>
        <tbody>
          {items.map((contract) => {
            const status = getContractStatusBadge(contract.status);
            const dday = getContractDdayBadge(contract);
            return (
              <tr
                key={contract.id}
                onClick={() => onNavigate('contractDetail', { contractId: contract.id })}
                className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2"
              >
                <td className="px-5 py-3.5 font-semibold text-ink">{getPropertyName(contract.property)}</td>
                <td className="px-3 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {dday && (
                      <Badge tone={dday.tone} className="font-num tabular-nums">
                        {dday.label}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3.5 font-num tabular-nums text-ink-2">{formatContractAmount(contract)}</td>
                <td className="px-3 py-3.5 text-ink-2">{contract.tenantName}</td>
                <td className="px-5 py-3.5 font-num tabular-nums text-ink-2">{formatPeriod(contract)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error && <NoticeBox className="m-5">{error.message}</NoticeBox>}
      {data.meta.hasNext && (
        // 다음 페이지 로드가 실패했으면 page는 이미 N이므로 N+1로 건너뛰지 않고 같은 페이지를 다시 불러온다.
        <div className="border-t border-line p-4 text-center">
          <Button variant="secondary" disabled={isLoading} onClick={() => (error ? refetch() : setPage((prev) => prev + 1))}>
            {isLoading ? '불러오는 중' : error ? '다시 시도' : '더 보기'}
          </Button>
        </div>
      )}
    </Card>
  );
};

// 계약 목록(S-01): 필터 칩 진행 중 / 시작 전 / 끝남 / 전체. 선택한 필터는 화면 안에서만 기억한다.
export const ContractListPage = ({ onNavigate, onUnauthorized }) => {
  const [filterKey, setFilterKey] = useState(CONTRACT_FILTERS[0].key);
  const filter = CONTRACT_FILTERS.find((item) => item.key === filterKey);

  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader
        title="계약"
        description="등록한 임대차 계약을 종료일이 가까운 순서로 보여 줘요."
        actions={
          <Button onClick={() => onNavigate('contractRegister')}>
            <Plus size={16} className="-ml-0.5 mr-1 inline-block" />
            계약 등록
          </Button>
        }
      />

      <div role="group" aria-label="계약 상태" className="flex flex-wrap gap-2">
        {CONTRACT_FILTERS.map((item) => (
          <FilterChip key={item.key} selected={item.key === filterKey} onClick={() => setFilterKey(item.key)}>
            {item.label}
          </FilterChip>
        ))}
      </div>

      <ContractListSection key={filterKey} filter={filter} onNavigate={onNavigate} onUnauthorized={onUnauthorized} />
    </div>
  );
};
