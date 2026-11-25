import { useCallback, useEffect, useState } from 'react';
import { Building2, ChevronDown, Paperclip, Plus, SearchX, Wrench } from 'lucide-react';
import { Badge, Button } from '@butler/ui';
import { ROOM_FILTER_OPTIONS } from '../../../shared/room';
import { getTicketCategoryLabel, TICKET_CATEGORY_OPTIONS } from '../../../shared/ticketLabels';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { RoomChip } from '../components/RoomChip/RoomChip';
import { TicketCompleteModal } from '../components/TicketCompleteModal/TicketCompleteModal';
import { TicketFilterCard } from '../components/TicketFilterCard/TicketFilterCard';
import { TicketInspector } from '../components/TicketInspector/TicketInspector';
import { TicketRegisterModal } from '../components/TicketRegisterModal/TicketRegisterModal';
import { useGetPropertyList } from '../hooks/useGetPropertyList';
import { useGetTicketList } from '../hooks/useGetTicketList';
import { usePatchTicket } from '../hooks/usePatchTicket';
import { findTicketSegment, formatTicketDateTime, getTicketStatusBadge, TICKET_STATUS_SEGMENTS, toFilterParam } from '../utils/ticketView';
import { formatUnitLabel } from '../utils/unitAddress';

const PAGE_SIZE = 20;
const PROPERTY_PICKER_SIZE = 100;
const TH = 'whitespace-nowrap px-4 py-3 text-left text-sub font-semibold text-ink-2';
const TD = 'whitespace-nowrap px-4 py-4';
const EMPTY_TEXT = {
  todo: { title: '처리할 요청이 없어요', description: '임차인이 앱에서 요청을 보내면 여기에 쌓이고 알림으로 알려 드려요.' },
  all: { title: '아직 수리 요청이 없어요', description: '임차인 요청이나 내가 등록한 요청이 여기에 모여요.' },
  done: { title: '완료한 요청이 없어요', description: '완료하면 하우스 로그에도 남아요.' },
  canceled: { title: '취소된 요청이 없어요', description: '' },
};

// 상태별 개수(GET /tickets?status=…&size=1 의 meta.total). 호실·분류·방 거르기는 같이 건다.
const useTicketCounts = ({ propertyId, category, room, reloadKey }, { onUnauthorized }) => {
  const options = { onUnauthorized };
  const base = { propertyId, category, room, size: 1 };
  const lists = {
    todo: useGetTicketList({ ...base, status: TICKET_STATUS_SEGMENTS[0].status }, options),
    all: useGetTicketList({ ...base, status: undefined }, options),
    done: useGetTicketList({ ...base, status: TICKET_STATUS_SEGMENTS[2].status }, options),
    canceled: useGetTicketList({ ...base, status: TICKET_STATUS_SEGMENTS[3].status }, options),
  };
  const refetchAll = [lists.todo.refetch, lists.all.refetch, lists.done.refetch, lists.canceled.refetch];
  useEffect(() => {
    if (reloadKey > 0) refetchAll.forEach((refetch) => refetch());
    // refetch 함수는 바뀌지 않는다. reloadKey 가 바뀔 때만 다시 센다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);
  return Object.fromEntries(Object.entries(lists).map(([key, list]) => [key, list.data?.meta.total]));
};

const TicketTable = ({ propertyId, status, category, room, compactProperty, selectedId, onSelect, emptyText, hasFilter, onUnauthorized }) => {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, refetch } = useGetTicketList({ propertyId, status, category, room, page, size: PAGE_SIZE }, { onUnauthorized });
  const items = data?.items ?? [];

  if (error && !data) return <NoticeBox className="m-5">{error.message}</NoticeBox>;
  if (isLoading && !data) {
    return (
      <p role="status" className="py-10 text-center text-body text-ink-3">
        불러오는 중입니다
      </p>
    );
  }
  if (items.length === 0) {
    return hasFilter ? (
      <EmptyState icon={SearchX} title="조건에 맞는 요청이 없어요" description="분류·방을 바꿔 보세요." />
    ) : (
      <EmptyState icon={Wrench} title={emptyText.title} description={emptyText.description} />
    );
  }

  return (
    <>
      {/* 패널이 열려 표가 좁아져도 열이 잘리지 않게 표 안에서 가로로 민다. */}
      <div className="overflow-x-auto">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              <th className={`${TH} pl-5`}>상태</th>
              <th className={`${TH} w-full`}>제목</th>
              <th className={TH}>호실</th>
              <th className={TH}>방</th>
              <th className={TH}>분류</th>
              <th className={TH}>요청</th>
              <th className={`${TH} pr-5 text-right`}>요청일</th>
            </tr>
          </thead>
          <tbody>
            {items.map((ticket) => {
              const badge = getTicketStatusBadge(ticket.status);
              const isSelected = ticket.id === selectedId;
              return (
                <tr
                  key={ticket.id}
                  tabIndex={0}
                  aria-selected={isSelected}
                  onClick={() => onSelect(ticket.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onSelect(ticket.id);
                  }}
                  className={`cursor-pointer border-b border-line outline-none last:border-b-0 focus-visible:bg-surface-2 ${isSelected ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}
                >
                  <td className={`${TD} pl-5`}>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </td>
                  <td className="min-w-[12rem] px-4 py-4">
                    <span className="font-semibold text-ink">{ticket.title}</span>
                    {ticket.attachments?.length > 0 && (
                      <span className="mt-0.5 flex items-center gap-1 font-num text-chip tabular-nums text-ink-3">
                        <Paperclip size={13} aria-hidden="true" />
                        첨부 {ticket.attachments.length}
                      </span>
                    )}
                  </td>
                  <td className={`${TD} text-ink-2`} title={ticket.property?.displayName}>
                    {compactProperty ? formatUnitLabel(ticket.property?.buildingNo, ticket.property?.unitNo) : ticket.property?.displayName}
                  </td>
                  <td className={TD}>
                    <RoomChip room={ticket.room} />
                  </td>
                  <td className={`${TD} text-ink-2`}>{getTicketCategoryLabel(ticket.category)}</td>
                  <td className={`${TD} text-ink-2`}>{ticket.requester?.role === 'TENANT' ? '임차인' : '직접 등록'}</td>
                  <td className={`${TD} pr-5 text-right font-num text-sub tabular-nums text-ink-3`}>{formatTicketDateTime(ticket.createdAt)?.slice(0, 10)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <NoticeBox className="m-5">{error.message}</NoticeBox>}
      {data.meta.hasNext && (
        <div className="border-t border-line p-4 text-center">
          <Button variant="secondary" size="h44" disabled={isLoading} onClick={() => (error ? refetch() : setPage((prev) => prev + 1))}>
            {isLoading ? '불러오는 중' : error ? '다시 시도' : '더 보기'}
          </Button>
        </div>
      )}
    </>
  );
};

// PC 유지보수 요청(시안 v2.2, docs/10 D4·D17, HL U-10). 하우스 로그 PC와 같은 틀: 거르기 카드 아래 표 7 : 상세 패널 3.
// - propertyId: 주소의 ?propertyId=(호실 거르기). 상태·분류·방은 화면 안에서만.
// - selectedTicketId: /tickets/:ticketId 로 들어온 요청(오른쪽 패널). completeOnOpen: 앱 목록처럼 완료 팝업을 바로 연다.
// - isRegisterOpen: /tickets/new(요청 등록 팝업). onOpenRegister·onCloseRegister 로 주소를 바꾼다.
export const TicketListPage = ({ propertyId, selectedTicketId, completeOnOpen = false, isRegisterOpen = false, onOpenRegister, onCloseRegister, onNavigate, onUnauthorized }) => {
  const owned = useGetPropertyList({ relation: 'OWNER', size: PROPERTY_PICKER_SIZE }, { onUnauthorized });
  const properties = owned.data?.items ?? [];
  const [segmentKey, setSegmentKey] = useState('todo');
  const [categories, setCategories] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [selectedId, setSelectedId] = useState(selectedTicketId ?? null);
  const [completing, setCompleting] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { updateTicket } = usePatchTicket({ onUnauthorized });

  useEffect(() => {
    if (selectedTicketId) setSelectedId(selectedTicketId);
  }, [selectedTicketId]);

  const segment = findTicketSegment(segmentKey);
  const category = toFilterParam(TICKET_CATEGORY_OPTIONS, categories);
  const room = toFilterParam(ROOM_FILTER_OPTIONS, rooms);
  const counts = useTicketCounts({ propertyId, category, room, reloadKey }, { onUnauthorized });
  const reload = useCallback(() => setReloadKey((prev) => prev + 1), []);

  // 완료 팝업을 바로 열라는 주소(state.complete)로 들어오면 그 요청을 받아 연다.
  const [pendingComplete, setPendingComplete] = useState(completeOnOpen);
  const isVerified = (ticket) =>
    properties.find((property) => property.id === ticket?.propertyId)?.myRelation?.verificationStatus === 'VERIFIED';

  const propertyField = (
    <label className="relative flex h-12 w-[320px] max-w-full items-center gap-2 rounded-input border border-line bg-surface px-3 focus-within:border-accent">
      <Building2 size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
      <select
        aria-label="호실"
        value={propertyId ?? ''}
        onChange={(event) => onNavigate('tickets', event.target.value ? { propertyId: event.target.value } : {}, { replace: true })}
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

  const total = counts[segment.key];
  const handleComplete = async (body) => {
    const result = await updateTicket(completing.id, body);
    if (result.data) {
      setCompleting(null);
      reload();
    }
    return result;
  };

  return (
    <div className="tickets-page w-full space-y-5 pb-10">
      <PageHeader
        title="유지보수 요청"
        description="임차인이 보낸 수리·점검 요청과 내가 등록한 요청을 처리해요. 완료하면 하우스 로그에 남아요."
        actions={
          <Button onClick={onOpenRegister}>
            <Plus size={16} className="-ml-0.5 mr-1 inline-block" />
            요청 등록
          </Button>
        }
      />
      {owned.error && <NoticeBox>{owned.error.message}</NoticeBox>}
      <TicketFilterCard
        propertyField={propertyField}
        segment={segment.key}
        counts={counts}
        onSegmentChange={setSegmentKey}
        categoryOptions={TICKET_CATEGORY_OPTIONS}
        categories={categories}
        onCategoriesChange={setCategories}
        roomOptions={ROOM_FILTER_OPTIONS}
        rooms={rooms}
        onRoomsChange={setRooms}
      />
      <div className="grid grid-cols-10 items-start gap-5">
        <section className={`tickets-page__table-wrap min-w-0 overflow-hidden rounded-card border border-line bg-surface ${selectedId ? 'col-span-7' : 'col-span-10'}`}>
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <p className="text-card-sm font-semibold text-ink">
              {segment.label}
              {total !== undefined && (
                <>
                  {' '}
                  <span className="font-num tabular-nums text-accent-strong">{total}</span>건
                </>
              )}
            </p>
            <p className="text-sub text-ink-3">최근 요청 순</p>
          </div>
          <TicketTable
            key={`${propertyId}-${segment.key}-${category}-${room}-${reloadKey}`}
            propertyId={propertyId}
            status={segment.status}
            category={category}
            room={room}
            compactProperty={Boolean(selectedId)}
            selectedId={selectedId}
            onSelect={setSelectedId}
            emptyText={EMPTY_TEXT[segment.key]}
            hasFilter={Boolean(category || room)}
            onUnauthorized={onUnauthorized}
          />
        </section>
        {selectedId && (
          <TicketInspector
            key={`${selectedId}-${reloadKey}`}
            ticketId={selectedId}
            onClose={() => setSelectedId(null)}
            onComplete={setCompleting}
            onChanged={reload}
            onLoaded={(ticket) => {
              if (pendingComplete && ticket.status === 'IN_PROGRESS' && !ticket.isReadOnly) setCompleting(ticket);
              setPendingComplete(false);
            }}
            onNavigate={onNavigate}
            onUnauthorized={onUnauthorized}
          />
        )}
      </div>

      {completing && <TicketCompleteModal ticket={completing} isVerified={isVerified(completing)} onSubmit={handleComplete} onClose={() => setCompleting(null)} />}
      {isRegisterOpen && (
        <TicketRegisterModal
          properties={properties}
          initialPropertyId={propertyId}
          onClose={onCloseRegister}
          onCreated={(ticket) => {
            onCloseRegister({ ticketId: ticket.id });
            setSelectedId(ticket.id);
            reload();
          }}
          onUnauthorized={onUnauthorized}
        />
      )}
    </div>
  );
};
