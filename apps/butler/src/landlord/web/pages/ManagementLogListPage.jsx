import { useEffect, useState } from 'react';
import { Building2, History, Image, Plus } from 'lucide-react';
import { Badge, Button, SegmentedControl } from '@butler/ui';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { LogFormModal } from '../components/LogFormModal/LogFormModal';
import { LogInspector } from '../components/LogInspector/LogInspector';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { TableToolbar } from '../components/TableToolbar/TableToolbar';
import { useGetManagementLogList } from '../hooks/useGetManagementLogList';
import { useGetPropertyList } from '../hooks/useGetPropertyList';
import { formatWon } from '../utils/contract';
import { getLogTypeLabel, isFutureLog, TYPE_FILTER_OPTIONS } from '../utils/managementLog';

const PAGE_SIZE = 20;
// 호실 필터는 지금 소유한 호실과 소유가 끝난 호실 전부(목록 API 최대 크기)
const PROPERTY_PICKER_SIZE = 100;
const TH = 'whitespace-nowrap px-5 py-3 text-left text-sub font-semibold text-ink-2';

// 한 필터 조합의 표. 필터가 바뀌면 key로 새로 시작해 page가 1로 돌아간다. 건수는 작업 줄로 올린다(onTotal).
const ManagementLogTable = ({ propertyId, type, selectedId, onSelect, onReset, onTotal, onUnauthorized }) => {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, refetch } = useGetManagementLogList({ propertyId, type, page, size: PAGE_SIZE }, { onUnauthorized });
  const items = data?.items ?? [];
  const total = data?.meta.total;

  useEffect(() => {
    onTotal(total);
  }, [total, onTotal]);

  if (error && !data) return <NoticeBox className="m-5">{error.message}</NoticeBox>;
  if (isLoading && !data) {
    return (
      <p role="status" className="py-10 text-center text-body text-ink-3">
        불러오는 중입니다
      </p>
    );
  }
  if (items.length === 0) {
    const hasFilter = Boolean(propertyId || type);
    return (
      <EmptyState
        icon={History}
        title={hasFilter ? '조건에 맞는 기록이 없어요' : '아직 관리 로그가 없어요'}
        description={hasFilter ? '필터를 바꾸거나 새 기록을 남겨 보세요.' : '수리·점검·메모를 남기면 날짜 순서로 여기에 모여요.'}
        action={
          hasFilter && (
            <button type="button" onClick={onReset} className="text-sub font-semibold text-accent hover:text-accent-strong">
              필터 초기화
            </button>
          )
        }
      />
    );
  }

  return (
    <>
      <table className="w-full text-body">
        <thead>
          <tr className="border-b border-line bg-surface-2">
            <th className={`${TH} w-24`}>날짜</th>
            <th className={`${TH} w-full`}>제목</th>
            <th className={TH}>호실</th>
            <th className={TH}>구분</th>
            <th className={`${TH} text-right`}>비용</th>
          </tr>
        </thead>
        <tbody>
          {items.map((log) => {
            const isSelected = log.id === selectedId;
            return (
              <tr
                key={log.id}
                tabIndex={0}
                aria-selected={isSelected}
                onClick={() => onSelect(log.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onSelect(log.id);
                }}
                className={`cursor-pointer border-b border-line outline-none last:border-b-0 focus-visible:bg-surface-2 ${
                  isSelected ? 'bg-accent-soft' : 'hover:bg-surface-2'
                }`}
              >
                <td className="whitespace-nowrap px-5 py-4 font-num text-sub tabular-nums text-ink-3">{log.occurredOn}</td>
                <td className="px-5 py-4">
                  <span className="font-semibold text-ink">{log.title}</span>
                  {log.attachments?.length > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 align-middle font-num text-chip tabular-nums text-ink-3">
                      <Image size={13} aria-label="사진" />
                      {log.attachments.length}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-ink-2">{log.property.displayName}</td>
                <td className="whitespace-nowrap px-5 py-4">
                  <span className="flex gap-1.5">
                    <Badge>{getLogTypeLabel(log.type)}</Badge>
                    {isFutureLog(log) && <Badge tone="warning">예정</Badge>}
                  </span>
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right font-num font-semibold tabular-nums text-ink-2">{formatWon(log.cost) ?? '—'}</td>
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

// 유형 세그먼트: 전체 + 수리·점검·메모·수리 요청 완료. 값 ''은 전체(유형 조건 없음).
const TYPE_SEGMENT_OPTIONS = [{ value: '', label: '전체' }, ...TYPE_FILTER_OPTIONS];

// 관리 로그(하우스 로그) 목록(S-04): 표 7 : 기록 상세 패널 3. 작업 줄은 호실 · 유형 · [초기화] · 건수.
// - 호실 필터는 주소(?propertyId=)에 남겨 호실 상세의 [전체 보기]로 바로 들어온다.
// - selectedLogId: /logs/:logId 로 들어온 기록(오른쪽 패널에 연다). 표에서 고르면 화면 안에서만 바꾼다.
// - modal: 주소에 묶인 기록 팝업({ logId }는 수정, {}는 추가). onCloseModal로 닫고, 저장하면 표와 패널을 새로 고친다.
export const ManagementLogListPage = ({ propertyId, selectedLogId, modal, onOpenModal, onCloseModal, onNavigate, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const owned = useGetPropertyList({ relation: 'OWNER', size: PROPERTY_PICKER_SIZE }, hookOptions);
  const formerlyOwned = useGetPropertyList({ relation: 'FORMER_OWNER', size: PROPERTY_PICKER_SIZE }, hookOptions);
  // 팔았다가 다시 소유한 호실이 두 번 나오지 않게 id로 합친다.
  const properties = [
    ...new Map([...(owned.data?.items ?? []), ...(formerlyOwned.data?.items ?? [])].map((item) => [item.id, item])).values(),
  ];
  const [type, setType] = useState(null);
  const [selectedId, setSelectedId] = useState(selectedLogId ?? null);
  const [reloadKey, setReloadKey] = useState(0);
  const [total, setTotal] = useState();
  const hasFilter = Boolean(propertyId || type);

  // 수정 팝업 주소(/logs/:logId/edit)로 바로 들어오면 그 기록을 패널에도 연다.
  const editingLogId = modal?.logId;
  useEffect(() => {
    if (editingLogId) setSelectedId(editingLogId);
  }, [editingLogId]);

  const resetFilters = () => {
    setType(null);
    if (propertyId) onNavigate('logs', {}, { replace: true });
  };
  const handleSaved = (log) => {
    setSelectedId(log.id);
    setReloadKey((prev) => prev + 1);
    onCloseModal();
  };
  const handleDeleted = () => {
    setSelectedId(null);
    setReloadKey((prev) => prev + 1);
  };

  return (
    <div className="logs-page w-full space-y-5 pb-10">
      <PageHeader
        title="관리 로그 (하우스 로그)"
        description="내 호실의 수리·점검·메모를 날짜 순서로 모아 봐요."
        actions={
          <Button onClick={() => onOpenModal({})}>
            <Plus size={16} className="-ml-0.5 mr-1 inline-block" />
            기록 추가
          </Button>
        }
      />

      <div className="grid grid-cols-10 items-start gap-5">
        <section className="logs-page__table-wrap col-span-7 overflow-hidden rounded-card border border-line bg-surface">
          <TableToolbar aside={total !== undefined && <span className="font-num tabular-nums">{total}건</span>}>
            <label className="flex h-11 items-center gap-2 rounded-input border border-line bg-surface px-3 focus-within:border-accent">
              <Building2 size={16} className="text-ink-3" aria-hidden="true" />
              <select
                aria-label="호실"
                value={propertyId ?? ''}
                onChange={(event) => onNavigate('logs', { propertyId: event.target.value || undefined }, { replace: true })}
                className="max-w-xs bg-transparent text-body text-ink outline-none"
              >
                <option value="">전체 호실</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.displayName}
                  </option>
                ))}
              </select>
            </label>
            <SegmentedControl ariaLabel="유형" options={TYPE_SEGMENT_OPTIONS} value={type ?? ''} onChange={(value) => setType(value || null)} />
            {hasFilter && (
              <button type="button" onClick={resetFilters} className="min-h-11 rounded-input px-2 text-sub font-semibold text-accent hover:text-accent-strong">
                초기화
              </button>
            )}
          </TableToolbar>
          <ManagementLogTable
            key={`${propertyId}-${type}-${reloadKey}`}
            propertyId={propertyId}
            type={type ?? undefined}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReset={resetFilters}
            onTotal={setTotal}
            onUnauthorized={onUnauthorized}
          />
        </section>

        <LogInspector
          key={`${selectedId}-${reloadKey}`}
          logId={selectedId ?? undefined}
          onClose={() => setSelectedId(null)}
          onEdit={(logId) => onOpenModal({ logId })}
          onDeleted={handleDeleted}
          onNavigate={onNavigate}
          onUnauthorized={onUnauthorized}
        />
      </div>

      {modal && (
        <LogFormModal
          logId={modal.logId}
          initialPropertyId={propertyId}
          onClose={onCloseModal}
          onSaved={handleSaved}
          onUnauthorized={onUnauthorized}
        />
      )}
    </div>
  );
};
