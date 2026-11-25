import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card } from '@butler/ui';
import { getContractList, getTicketList } from '@butler/api-client';
import { Paperclip, Plus } from 'lucide-react';
import { getRoomLabel } from '../../shared/room';
import { getTicketCategoryLabel, TICKET_TABS } from '../../shared/ticketLabels';
import { TicketStepBar } from '../components/TicketStepBar/TicketStepBar';
import { useLoad } from '../hooks/useLoad';
import { TICKET_NEW_PATH, ticketPath } from '../routes';
import { formatTicketShortDate, formatTicketShortDateTime, getTenantTicketBadge, toRequestableHomes } from '../utils/tickets';

// 한 사람의 계약·요청은 몇 건뿐이라 한 번에 받는다(서버 최대 100).
const CONTRACT_PARAMS = { sort: 'endDate:asc', size: 50 };
const LIST_SIZE = 100;

const RoomChip = ({ room }) => {
  const label = getRoomLabel(room);
  return label ? <span className="rounded-chip border border-line bg-surface px-2 py-0.5 text-chip font-semibold text-ink-2">{label}</span> : null;
};

// 요청 카드(시안 v2.2 ①·②). 누르면 상세. 진행 중이면 단계 막대, 완료면 처리 내용 한 줄.
const TicketCard = ({ ticket, onOpen }) => {
  const badge = getTenantTicketBadge(ticket.status);
  const isEnded = ticket.status === 'DONE' || ticket.status === 'CANCELED';
  const when = isEnded
    ? `${ticket.status === 'DONE' ? '완료' : '취소'} ${formatTicketShortDate(ticket.closedAt ?? ticket.updatedAt)}`
    : formatTicketShortDateTime(ticket.createdAt);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`flex w-full flex-col gap-1 rounded-card border border-line bg-surface p-4 text-left ${ticket.status === 'CANCELED' ? 'opacity-80' : ''}`}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-m-card font-semibold text-ink">{ticket.title}</span>
          <Badge mobile tone={badge.tone} className="shrink-0">
            {badge.label}
          </Badge>
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-m-sub text-ink-3">
          <RoomChip room={ticket.room} />
          <span>
            {getTicketCategoryLabel(ticket.category)} · {ticket.property?.displayName} · <span className="font-num tabular-nums">{when}</span>
          </span>
        </span>
        {!isEnded && <span className="mt-1 line-clamp-2 text-body text-ink-2">{ticket.description}</span>}
        {ticket.attachments?.length > 0 && (
          <span className="mt-1 flex items-center gap-1 text-m-sub text-ink-3">
            <Paperclip size={14} strokeWidth={1.8} aria-hidden="true" />
            첨부 <span className="font-num tabular-nums">{ticket.attachments.length}</span>개
          </span>
        )}
        {ticket.status === 'DONE' && ticket.resolutionNote && (
          <span className="mt-1 line-clamp-2 rounded-input bg-surface-2 px-3 py-2 text-m-sub text-ink-2">처리 내용 · {ticket.resolutionNote}</span>
        )}
        {!isEnded && (
          <span className="mt-3 block">
            <TicketStepBar status={ticket.status} />
          </span>
        )}
      </button>
    </li>
  );
};

// 임차인 수리 요청 탭(시안 v2.2 ①②⑧): 진행 중 / 완료(취소 포함) 탭, 개수, [요청하기].
// 요청할 수 있는 집(시작 전·진행 중 계약)이 없으면 [요청하기] 대신 안내를 보여 준다(이미 보낸 요청은 그대로 보인다).
export const TicketListPage = ({ onUnauthorized }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TICKET_TABS.find((item) => item.key === searchParams.get('tab')) ?? TICKET_TABS[0];

  const contracts = useLoad('tenant-contracts', () => getContractList(CONTRACT_PARAMS).then((body) => body.data ?? []), { onUnauthorized });
  const counts = useLoad(
    'tenant-ticket-counts',
    () => Promise.all(TICKET_TABS.map((item) => getTicketList({ status: item.status, size: 1 }).then((body) => body.meta?.total ?? 0))),
    { onUnauthorized },
  );
  const tickets = useLoad(
    `tenant-tickets:${tab.key}`,
    () => getTicketList({ status: tab.status, size: LIST_SIZE, sort: 'createdAt:desc' }).then((body) => body.data ?? []),
    { onUnauthorized },
  );

  const homes = toRequestableHomes(contracts.data ?? []);
  const canRequest = homes.length > 0;
  const totalCount = counts.data ? counts.data[0] + counts.data[1] : null;

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-m-h1 font-bold text-ink">수리 요청</h1>
        {canRequest && (
          <Button size="h44" onClick={() => navigate(TICKET_NEW_PATH)} className="shrink-0">
            <Plus size={16} strokeWidth={2} className="-ml-0.5 mr-1 inline-block" aria-hidden="true" />
            요청하기
          </Button>
        )}
      </div>

      {contracts.data && !canRequest && (
        <Card>
          <p className="text-m-card font-semibold text-ink">수리 요청을 보낼 집이 없어요</p>
          <p className="mt-1 text-body text-ink-2">시작 전이거나 진행 중인 계약이 연결돼야 요청할 수 있어요. 임대인이 보낸 초대 링크를 열면 계약이 추가돼요.</p>
        </Card>
      )}

      {(canRequest || totalCount > 0) && (
        <div role="tablist" aria-label="요청 상태" className="-mx-5 flex border-b border-line px-5">
          {TICKET_TABS.map((item, index) => {
            const selected = item.key === tab.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setSearchParams(index === 0 ? {} : { tab: item.key }, { replace: true })}
                className={`flex-1 border-b-2 py-2.5 text-m-label ${selected ? 'border-accent font-semibold text-accent' : 'border-transparent font-medium text-ink-3'}`}
              >
                {item.label}
                {counts.data && <span className="font-num tabular-nums"> {counts.data[index]}</span>}
              </button>
            );
          })}
        </div>
      )}

      {tickets.isLoading && (
        <p role="status" className="py-6 text-center text-body text-ink-3">
          요청을 불러오는 중이에요
        </p>
      )}
      {tickets.error && (
        <Card>
          <p role="alert" className="text-body text-crit-ink">
            {tickets.error.message}
          </p>
          <Button variant="secondary" size="h44" className="mt-3 w-full" onClick={tickets.refetch}>
            다시 불러오기
          </Button>
        </Card>
      )}
      {/* 탭을 바꾸는 동안에는 앞 탭 목록을 보이지 않는다(useLoad 는 새 값을 받기 전까지 앞 값을 들고 있다). */}
      {!tickets.isLoading && tickets.data && tickets.data.length === 0 && (canRequest || totalCount > 0) && (
        <p className="py-8 text-center text-body text-ink-3">{tab.key === 'active' ? '진행 중인 요청이 없어요' : '완료된 요청이 없어요'}</p>
      )}
      {!tickets.isLoading && tickets.data && tickets.data.length > 0 && (
        <ul className="space-y-3">
          {tickets.data.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} onOpen={() => navigate(ticketPath(ticket.id))} />
          ))}
        </ul>
      )}
    </div>
  );
};
