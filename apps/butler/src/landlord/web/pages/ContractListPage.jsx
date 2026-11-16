import { useState } from 'react';
import { ChevronRight, FileText, Plus, Wallet } from 'lucide-react';
import { Badge, Button, SegmentedControl } from '@butler/ui';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { IconTile } from '../components/IconTile/IconTile';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { TableToolbar } from '../components/TableToolbar/TableToolbar';
import { useGetContractList } from '../hooks/useGetContractList';
import {
  CONTRACT_FILTERS,
  CONTRACT_LEGAL_NOTICE,
  formatContractAmount,
  formatRentPaymentDay,
  getContractDdayBadge,
  getContractStatusBadge,
  getLeaseTypeLabel,
} from '../utils/contract';

const PAGE_SIZE = 20;

// 세그먼트 옆 개수: 필터마다 1건만 받아 meta.total을 읽는다.
const useFilterCount = (filter, hookOptions) => useGetContractList({ ...filter.query, size: 1 }, hookOptions).data?.meta.total;

const getRowTone = (contract, dday) => {
  if (contract.status === 'EXPIRED' || contract.status === 'TERMINATED') return 'mute';
  return dday?.tone === 'warning' || dday?.tone === 'danger' ? 'warn' : 'accent';
};

const TH = 'whitespace-nowrap px-5 py-3 text-sub font-semibold text-ink-2';

// 한 필터의 표. 필터가 바뀌면 key로 새로 시작해 page가 1로 돌아간다. 정렬은 종료일 오름차순(D-17).
// 행을 누르면 그 계약의 호실 상세(계약 영역)로 간다. 계약 상세 페이지는 호실 상세로 합쳤다.
const ContractTable = ({ filter, onNavigate, onUnauthorized }) => {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, refetch } = useGetContractList(
    { ...filter.query, sort: 'endDate:asc', page, size: PAGE_SIZE },
    { onUnauthorized },
  );
  const items = data?.items ?? [];
  const goDetail = (contract) => onNavigate('propertyDetail', { propertyId: contract.property.id, contractId: contract.id });

  if (error && !data) return <NoticeBox className="m-5">{error.message}</NoticeBox>;
  if (isLoading && !data) {
    return (
      <p role="status" className="py-10 text-center text-body text-ink-3">
        불러오는 중입니다
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={filter.key === 'all' ? '등록한 계약이 없어요' : `${filter.label} 계약이 없어요`}
        description="계약을 등록하면 금액·기간·입금일을 여기서 한눈에 봐요."
        action={
          filter.key === 'all' && (
            <Button size="h44" onClick={() => onNavigate('contractRegister')}>
              <Plus size={16} className="-ml-0.5 mr-1 inline-block" />
              계약 등록
            </Button>
          )
        }
      />
    );
  }

  return (
    <>
      <table className="w-full text-body">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-left">
            <th className={`${TH} w-full`}>호실</th>
            <th className={TH}>임차인</th>
            <th className={`${TH} text-right`}>보증금 / 월세</th>
            <th className={TH}>월세 입금일</th>
            <th className={`${TH} text-right`}>종료일</th>
            <th className={`${TH} w-10`}>
              <span className="sr-only">이동</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((contract) => {
            const status = getContractStatusBadge(contract);
            const dday = getContractDdayBadge(contract);
            const isMonthly = contract.leaseType === 'MONTHLY';
            return (
              <tr
                key={contract.id}
                tabIndex={0}
                onClick={() => goDetail(contract)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') goDetail(contract);
                }}
                className="cursor-pointer border-b border-line outline-none last:border-b-0 hover:bg-surface-2 focus-visible:bg-surface-2"
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <IconTile icon={FileText} tone={getRowTone(contract, dday)} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{contract.property.displayName}</p>
                      <div className="mt-1 flex gap-1.5">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        <Badge>{getLeaseTypeLabel(contract.leaseType)}</Badge>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-ink-2">{contract.tenantName}</td>
                <td className="whitespace-nowrap px-5 py-4 text-right font-num font-semibold tabular-nums text-ink">{formatContractAmount(contract)}</td>
                <td className="whitespace-nowrap px-5 py-4">
                  {!isMonthly ? (
                    <span className="text-ink-3">—</span>
                  ) : contract.rentPaymentDay != null ? (
                    <span className="font-num tabular-nums">{formatRentPaymentDay(contract.rentPaymentDay)}</span>
                  ) : (
                    <Badge tone="warning">
                      <Wallet size={12} className="mr-1 inline-block" aria-hidden="true" />
                      입력 필요
                    </Badge>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right font-num tabular-nums text-ink-2">
                  {contract.endDate}
                  {dday && (
                    <Badge tone={dday.tone} className="ml-2 font-num tabular-nums">
                      {dday.label}
                    </Badge>
                  )}
                </td>
                <td className="px-5 py-4 text-ink-3">
                  <ChevronRight size={18} aria-hidden="true" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error && <NoticeBox className="m-5">{error.message}</NoticeBox>}
      {data.meta.hasNext && (
        // 다음 페이지 로드가 실패했으면 page는 이미 N이므로 N+1로 건너뛰지 않고 같은 페이지를 다시 불러온다.
        <div className="border-t border-line p-4 text-center">
          <Button variant="secondary" size="h44" disabled={isLoading} onClick={() => (error ? refetch() : setPage((prev) => prev + 1))}>
            {isLoading ? '불러오는 중' : error ? '다시 시도' : '더 보기'}
          </Button>
        </div>
      )}
    </>
  );
};

// 계약 목록(S-01, CRUD 표): 머리에는 [계약 등록]만, 표 위 작업 줄에 상태 세그먼트(개수 포함)·정렬 안내.
export const ContractListPage = ({ onNavigate, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const [filterKey, setFilterKey] = useState(CONTRACT_FILTERS[0].key);
  const filter = CONTRACT_FILTERS.find((item) => item.key === filterKey);
  const counts = [
    useFilterCount(CONTRACT_FILTERS[0], hookOptions),
    useFilterCount(CONTRACT_FILTERS[1], hookOptions),
    useFilterCount(CONTRACT_FILTERS[2], hookOptions),
    useFilterCount(CONTRACT_FILTERS[3], hookOptions),
  ];
  const filterOptions = CONTRACT_FILTERS.map((item, index) => ({ value: item.key, label: item.label, count: counts[index] }));

  return (
    <div className="contracts-page w-full space-y-5 pb-10">
      <PageHeader
        title="계약"
        description={`${CONTRACT_LEGAL_NOTICE}. 행을 누르면 호실 상세의 계약으로 가요.`}
        actions={
          <Button onClick={() => onNavigate('contractRegister')}>
            <Plus size={16} className="-ml-0.5 mr-1 inline-block" />
            계약 등록
          </Button>
        }
      />

      <section className="contracts-page__table-wrap overflow-hidden rounded-card border border-line bg-surface">
        <TableToolbar aside="종료일 가까운 순">
          <SegmentedControl ariaLabel="계약 상태" options={filterOptions} value={filterKey} onChange={setFilterKey} />
        </TableToolbar>
        <ContractTable key={filterKey} filter={filter} onNavigate={onNavigate} onUnauthorized={onUnauthorized} />
      </section>
    </div>
  );
};
