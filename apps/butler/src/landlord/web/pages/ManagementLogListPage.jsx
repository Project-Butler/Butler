import { useEffect, useState } from 'react';
import { Building2, ChevronDown, History, Image, LayoutList, Plus, SearchX } from 'lucide-react';
import { Badge, Button, PageSkeleton } from '@butler/ui';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { LogFilterCard, MAX_QUERY_LENGTH } from '../components/LogFilterCard/LogFilterCard';
import { LogFormModal } from '../components/LogFormModal/LogFormModal';
import { LogHomeSelect } from '../components/LogHomeSelect/LogHomeSelect';
import { LogInspector } from '../components/LogInspector/LogInspector';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { RoomChip } from '../components/RoomChip/RoomChip';
import { useGetManagementLogList } from '../hooks/useGetManagementLogList';
import { useGetPropertyList } from '../hooks/useGetPropertyList';
import { formatWon } from '../utils/contract';
import { getLogTypeLabel, isFutureLog, TYPE_FILTER_OPTIONS } from '../utils/managementLog';
import { ROOM_FILTER_OPTIONS } from '../../../shared/room';
import { formatUnitLabel } from '../utils/unitAddress';

const PAGE_SIZE = 20;
// 호실 필터는 지금 소유한 호실과 소유가 끝난 호실 전부(목록 API 최대 크기)
const PROPERTY_PICKER_SIZE = 100;
// 검색어는 입력을 멈추고 잠깐 뒤에 보낸다.
export const SEARCH_DELAY_MS = 300;
const TH = 'whitespace-nowrap px-5 py-3 text-left text-sub font-semibold text-ink-2';
const TD = 'whitespace-nowrap px-5 py-4';

// 고른 값을 보기 순서대로 쉼표로 잇는다. 아무것도 안 골랐으면 undefined(조건 없음).
const toCommaParam = (options, values) =>
  options
    .filter((option) => values.includes(option.value))
    .map((option) => option.value)
    .join(',') || undefined;

// 검색창 글자 → 보낼 q. 앞뒤 공백을 빼고 1~50자일 때만.
export const toSearchParam = (query) => {
  const trimmed = query.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_QUERY_LENGTH ? trimmed : undefined;
};

// 한 필터 조합의 표. 필터가 바뀌면 key로 새로 시작해 page가 1로 돌아간다. 건수는 표 머리로 올린다(onTotal).
// showProperty: '전체 호실'일 때만 호실 열. compactProperty: 상세 패널이 열려 좁을 때 호실을 짧은 이름(동·호)으로.
const ManagementLogTable = ({ propertyId, type, room, q, showProperty, compactProperty, selectedId, onSelect, onTotal, onUnauthorized }) => {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, refetch } = useGetManagementLogList(
    { propertyId, type, room, q, page, size: PAGE_SIZE },
    { onUnauthorized },
  );
  const items = data?.items ?? [];
  const total = data?.meta.total;

  useEffect(() => {
    onTotal(total);
  }, [total, onTotal]);

  if (error && !data) return <NoticeBox className="m-5">{error.message}</NoticeBox>;
  if (isLoading && !data) {
    return <PageSkeleton variant="list" />;
  }
  if (items.length === 0) {
    // 호실만 고른 것은 조건이 아니다(그 집에 기록이 아직 없는 것). 초기화 버튼은 두지 않는다(U-05).
    const hasFilter = Boolean(type || room || q);
    return hasFilter ? (
      <EmptyState icon={SearchX} title="조건에 맞는 기록이 없어요" description="검색어나 방·유형을 바꿔 보세요." />
    ) : (
      <EmptyState icon={History} title="아직 하우스 로그가 없어요" description="수리·점검·메모를 남기면 날짜 순서로 여기에 모여요." />
    );
  }

  return (
    <>
      {/* 패널이 열려 표가 좁아져도 열이 잘리지 않게 표 안에서 가로로 민다. */}
      <div className="overflow-x-auto">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              <th className={`${TH} w-28`}>날짜</th>
              <th className={`${TH} w-full`}>제목</th>
              {showProperty && <th className={TH}>호실</th>}
              <th className={TH}>방</th>
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
                  <td className={`${TD} font-num text-sub tabular-nums text-ink-3`}>{log.occurredOn}</td>
                  <td className="min-w-[12rem] px-5 py-4">
                    <span className="font-semibold text-ink">{log.title}</span>
                    {log.attachments?.length > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1 align-middle font-num text-chip tabular-nums text-ink-3">
                        <Image size={13} aria-label="사진" />
                        {log.attachments.length}
                      </span>
                    )}
                    {log.content && <p className="mt-0.5 line-clamp-1 break-all text-sub text-ink-3">{log.content}</p>}
                  </td>
                  {showProperty && (
                    <td className={`${TD} text-ink-2`} title={log.property.displayName}>
                      {compactProperty ? formatUnitLabel(log.property.buildingNo, log.property.unitNo) : log.property.displayName}
                    </td>
                  )}
                  <td className={TD}>
                    <RoomChip room={log.room} />
                  </td>
                  <td className={TD}>
                    <span className="flex gap-1.5">
                      <Badge>{getLogTypeLabel(log.type)}</Badge>
                      {isFutureLog(log) && <Badge tone="warning">예정</Badge>}
                    </span>
                  </td>
                  <td className={`${TD} text-right font-num font-semibold tabular-nums text-ink-2`}>{formatWon(log.cost) ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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

// 하우스 로그(S-04).
// - 집 선택(U-02): 주소에 propertyId·all이 없고 활성 소유 호실이 2개 이상이면 집 카드. 1개면 바로 그 집 표로.
//   기록 주소(/logs/:logId)·수정 팝업 주소는 늘 표 + 상세 패널로 연다.
// - 표 화면: 거르기 카드(시안 E: 검색·호실·유형·방, 전체 폭) 아래 표 7 : 기록 상세 패널 3.
//   호실은 주소(?propertyId=)에, '전체 호실'은 ?all=1로 남겨 집 카드로 되돌아가지 않게 한다. 유형·방·검색은 화면 안에서만.
// - selectedLogId: /logs/:logId 로 들어온 기록(오른쪽 패널에 연다). 표에서 고르면 화면 안에서만 바꾼다.
// - modal: 주소에 묶인 기록 팝업({ logId }는 수정, {}는 추가). onCloseModal로 닫고, 저장하면 표와 패널을 새로 고친다.
export const ManagementLogListPage = ({ propertyId, showAll = false, selectedLogId, modal, onOpenModal, onCloseModal, onNavigate, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const owned = useGetPropertyList({ relation: 'OWNER', size: PROPERTY_PICKER_SIZE }, hookOptions);
  const formerlyOwned = useGetPropertyList({ relation: 'FORMER_OWNER', size: PROPERTY_PICKER_SIZE }, hookOptions);
  // 팔았다가 다시 소유한 호실이 두 번 나오지 않게 id로 합친다.
  const properties = [
    ...new Map([...(owned.data?.items ?? []), ...(formerlyOwned.data?.items ?? [])].map((item) => [item.id, item])).values(),
  ];
  const [query, setQuery] = useState('');
  const [q, setQ] = useState();
  const [types, setTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [selectedId, setSelectedId] = useState(selectedLogId ?? null);
  const [reloadKey, setReloadKey] = useState(0);
  const [total, setTotal] = useState();

  // 수정 팝업 주소(/logs/:logId/edit)로 바로 들어오면 그 기록을 패널에도 연다.
  const editingLogId = modal?.logId;
  useEffect(() => {
    if (editingLogId) setSelectedId(editingLogId);
  }, [editingLogId]);

  // 검색어는 멈추고 SEARCH_DELAY_MS 뒤에 보낸다. 지우면 바로.
  useEffect(() => {
    const next = toSearchParam(query);
    if (!next) {
      setQ(undefined);
      return undefined;
    }
    const timer = setTimeout(() => setQ(next), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // 집 선택은 하우스 로그 첫 주소(/logs, /logs/new)에서만. 기록·수정 주소는 표로 연다.
  const isEntry = !propertyId && !showAll && !selectedLogId && !editingLogId;
  const activeHomes = owned.data?.items ?? [];
  const onlyHomeId = isEntry && !modal && owned.data && activeHomes.length === 1 ? activeHomes[0].id : undefined;
  useEffect(() => {
    if (onlyHomeId) onNavigate('logs', { propertyId: onlyHomeId }, { replace: true });
  }, [onlyHomeId, onNavigate]);
  const isHomeSelect = isEntry && activeHomes.length >= 2;
  // 집 수를 아직 모르면(첫 화면) 표를 잠깐 보였다 바꾸지 않게 기다린다. 불러오지 못하면 표로.
  const isDecidingView = isEntry && !owned.data && !owned.error;

  const type = toCommaParam(TYPE_FILTER_OPTIONS, types);
  const room = toCommaParam(ROOM_FILTER_OPTIONS, rooms);
  const showProperty = !propertyId;

  const handleSaved = (log) => {
    setSelectedId(log.id);
    setReloadKey((prev) => prev + 1);
    onCloseModal();
  };
  const handleDeleted = () => {
    setSelectedId(null);
    setReloadKey((prev) => prev + 1);
  };

  const addButton = (
    <Button onClick={() => onOpenModal({})}>
      <Plus size={16} className="-ml-0.5 mr-1 inline-block" />
      기록 추가
    </Button>
  );

  const propertyField = (
    <label className="relative flex h-12 w-[320px] max-w-full items-center gap-2 rounded-input border border-line bg-surface px-3 focus-within:border-accent">
      <Building2 size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
      <select
        aria-label="호실"
        value={propertyId ?? ''}
        onChange={(event) =>
          onNavigate('logs', event.target.value ? { propertyId: event.target.value } : { all: true }, { replace: true })
        }
        className="min-w-0 flex-1 appearance-none truncate bg-transparent pr-6 text-card-sm text-ink outline-none"
      >
        <option value="">전체 호실</option>
        {properties.map((property) => (
          <option key={property.id} value={property.id}>
            {property.displayName}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 text-ink-3" aria-hidden="true" />
    </label>
  );

  let body;
  if (isDecidingView) {
    body = <PageSkeleton variant="list" />;
  } else if (isHomeSelect) {
    body = (
      <LogHomeSelect
        key={reloadKey}
        homes={activeHomes}
        onSelectHome={(id) => onNavigate('logs', { propertyId: id })}
        onUnauthorized={onUnauthorized}
      />
    );
  } else {
    body = (
      <>
        <LogFilterCard
          query={query}
          onQueryChange={setQuery}
          propertyField={propertyField}
          typeOptions={TYPE_FILTER_OPTIONS}
          types={types}
          onTypesChange={setTypes}
          roomOptions={ROOM_FILTER_OPTIONS}
          rooms={rooms}
          onRoomsChange={setRooms}
        />
        <div className="grid grid-cols-10 items-start gap-5">
          <section className="logs-page__table-wrap col-span-7 min-w-0 overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <p className="text-card-sm font-semibold text-ink">
                기록
                {total !== undefined && (
                  <>
                    {' '}
                    <span className="font-num tabular-nums text-accent-strong">{total}</span>건
                  </>
                )}
              </p>
              <p className="text-sub text-ink-3">최근 날짜 순</p>
            </div>
            <ManagementLogTable
              key={`${propertyId}-${type}-${room}-${q}-${reloadKey}`}
              propertyId={propertyId}
              type={type}
              room={room}
              q={q}
              showProperty={showProperty}
              compactProperty={showProperty && Boolean(selectedId)}
              selectedId={selectedId}
              onSelect={setSelectedId}
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
      </>
    );
  }

  return (
    <div className="logs-page w-full space-y-5 pb-10">
      <PageHeader
        title="하우스 로그"
        description={
          isHomeSelect
            ? `집 ${activeHomes.length}채 · 진행 중인 수리 요청이 많은 집부터 보여요.`
            : '내 호실의 수리·점검·메모를 날짜 순서로 모아 봐요.'
        }
        actions={
          <>
            {isHomeSelect && (
              <Button variant="secondary" onClick={() => onNavigate('logs', { all: true })}>
                <LayoutList size={16} className="-ml-0.5 mr-1 inline-block" />
                모든 집 기록 보기
              </Button>
            )}
            {addButton}
          </>
        }
      />

      {body}

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
