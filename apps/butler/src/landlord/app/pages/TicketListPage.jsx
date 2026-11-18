import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button } from '@butler/ui';
import { DocumentThumbnail } from '../../web/components/DocumentThumbnail/DocumentThumbnail';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { useGetTicketList } from '../../web/hooks/useGetTicketList';
import { useOpenThread } from '../../web/hooks/useOpenThread';
import { usePatchTicket } from '../../web/hooks/usePatchTicket';
import { formatUnitLabel } from '../../web/utils/unitAddress';
import { AppTabShell } from '../components/AppTabShell/AppTabShell';
import { UnderlineTabs } from '../components/UnderlineTabs/UnderlineTabs';
import { useGoBack, useGoTo } from '../utils/navigation';
import {
  canOpenTicketThread,
  formatTicketDateTime,
  getPrimaryTicketAction,
  getRequesterLabel,
  getTicketStatusBadge,
  TICKET_TABS,
} from '../utils/ticketView';

const PAGE_SIZE = 20;
const PREVIEW_PHOTO_COUNT = 3;
const CARD_CLASS = 'rounded-card border border-line bg-surface';

// 요청 카드 한 장. 카드를 누르면 상세, 아래 버튼은 대화하기·처리 시작·완료 처리.
const TicketCard = ({ ticket, busy, onOpen, onChat, onStart, onComplete, onUnauthorized }) => {
  const badge = getTicketStatusBadge(ticket.status);
  const action = getPrimaryTicketAction(ticket);
  const canChat = canOpenTicketThread(ticket);
  const photos = ticket.attachments.slice(0, PREVIEW_PHOTO_COUNT);

  return (
    <li className={`${CARD_CLASS} flex flex-col gap-3 p-4`}>
      <button type="button" onClick={onOpen} className="flex flex-col gap-1.5 text-left">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-m-card font-semibold text-ink">
            {ticket.title} · {formatUnitLabel(ticket.property.buildingNo, ticket.property.unitNo)}
          </span>
          <Badge mobile tone={badge.tone} className="shrink-0">
            {badge.label}
          </Badge>
        </span>
        <span className="text-m-sub text-ink-3">
          {getRequesterLabel(ticket)} · <span className="font-num tabular-nums">{formatTicketDateTime(ticket.createdAt)}</span>
        </span>
        <span className="line-clamp-2 text-body text-ink-2">{ticket.description}</span>
      </button>

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((document) => (
            <li key={document.id}>
              <DocumentThumbnail document={document} onUnauthorized={onUnauthorized} />
            </li>
          ))}
        </ul>
      )}

      {(canChat || action) && (
        <div className="flex gap-2">
          {canChat && (
            <Button variant="secondary" size="h44" className="flex-1" disabled={busy} onClick={onChat}>
              대화하기
            </Button>
          )}
          {action === 'START' && (
            <Button size="h44" className="flex-1" disabled={busy} onClick={onStart}>
              처리 시작
            </Button>
          )}
          {action === 'COMPLETE' && (
            <Button size="h44" className="flex-1" disabled={busy} onClick={onComplete}>
              완료 처리
            </Button>
          )}
        </div>
      )}
    </li>
  );
};

// 한 탭(상태 묶음)의 목록. 탭·호실이 바뀌거나 처리 후 다시 그릴 때 key 로 새로 시작해 page 가 1로 돌아간다.
const TicketListSection = ({ propertyId, tab, onUnauthorized }) => {
  const goTo = useGoTo();
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState(null);
  const { data, error, isLoading, refetch } = useGetTicketList({ propertyId, status: tab.status, page, size: PAGE_SIZE }, { onUnauthorized });
  const { updateTicket, isLoading: isUpdating } = usePatchTicket({ onUnauthorized });
  const { openThread, isLoading: isOpening } = useOpenThread({ onUnauthorized });
  const busy = isUpdating || isOpening;

  const handleStart = async (ticket) => {
    setActionError(null);
    const result = await updateTicket(ticket.id, { status: 'IN_PROGRESS' });
    if (result.error) {
      setActionError(result.error.message);
      return;
    }
    if (!result.data) return;
    // 진행 중 탭 안에서 상태만 바뀌므로 첫 페이지부터 다시 불러온다.
    if (page === 1) refetch();
    else setPage(1);
  };

  const handleChat = async (ticket) => {
    setActionError(null);
    const result = await openThread('TICKET', ticket.id);
    if (result.error) {
      setActionError(result.error.message);
      return;
    }
    if (result.data) goTo('thread', { threadId: result.data.id });
  };

  if (error && !data) return <NoticeBox>{error.message}</NoticeBox>;
  if (!data) {
    return (
      <p role="status" className="py-10 text-center text-body text-ink-3">
        불러오는 중입니다
      </p>
    );
  }
  if (data.items.length === 0) {
    return <p className="py-10 text-center text-body text-ink-3">{tab.key === 'active' ? '진행 중인 요청이 없어요' : '완료된 요청이 없어요'}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {actionError && <NoticeBox>{actionError}</NoticeBox>}
      <ul className="flex flex-col gap-3">
        {data.items.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            busy={busy}
            onOpen={() => goTo('ticketDetail', { ticketId: ticket.id })}
            onChat={() => handleChat(ticket)}
            onStart={() => handleStart(ticket)}
            onComplete={() => goTo('ticketDetail', { ticketId: ticket.id, complete: true })}
            onUnauthorized={onUnauthorized}
          />
        ))}
      </ul>
      {error && <NoticeBox>{error.message}</NoticeBox>}
      {data.meta.hasNext && (
        <Button variant="secondary" size="h44" disabled={isLoading} onClick={() => (error ? refetch() : setPage((prev) => prev + 1))}>
          {isLoading ? '불러오는 중' : error ? '다시 시도' : '더 보기'}
        </Button>
      )}
    </div>
  );
};

// 다른 탭의 건수만 센다(size 1).
const useTabCount = (propertyId, tab, onUnauthorized) => {
  const { data } = useGetTicketList({ propertyId, status: tab.status, size: 1 }, { onUnauthorized });
  return data?.meta.total ?? null;
};

// 임대인 앱 수리·점검 (Figma M09). 진행 중(접수·처리 중) / 완료(완료·취소) 탭과 요청 카드.
// propertyId 가 있으면 그 호실 요청만 본다(부동산 상세 ⋯ 메뉴에서 들어올 때).
export const TicketListPage = ({ propertyId, onUnauthorized }) => {
  const goTo = useGoTo();
  const goBack = useGoBack('buildingList');
  const [tabKey, setTabKey] = useState(TICKET_TABS[0].key);
  const tab = TICKET_TABS.find((item) => item.key === tabKey);

  const counts = {
    active: useTabCount(propertyId, TICKET_TABS[0], onUnauthorized),
    closed: useTabCount(propertyId, TICKET_TABS[1], onUnauthorized),
  };

  const addButton = (
    <button
      type="button"
      aria-label="수리·점검 요청 등록"
      onClick={() => goTo('ticketRegister', { propertyId })}
      className="flex h-11 w-11 items-center justify-center text-ink-2"
    >
      <Plus size={22} aria-hidden="true" />
    </button>
  );

  return (
    <AppTabShell backBar={{ title: '수리·점검', onBack: goBack, action: addButton }}>
      <div className="flex flex-col gap-3.5">
        <UnderlineTabs
          ariaLabel="요청 상태"
          idPrefix="tickets"
          value={tabKey}
          onChange={setTabKey}
          options={TICKET_TABS.map((item) => ({
            value: item.key,
            label: counts[item.key] != null ? `${item.label} ${counts[item.key]}` : item.label,
          }))}
        />
        <div role="tabpanel" id="tickets-panel" aria-labelledby={`tickets-tab-${tabKey}`}>
          <TicketListSection
            key={`${propertyId}-${tabKey}`}
            propertyId={propertyId}
            tab={tab}
            onUnauthorized={onUnauthorized}
          />
        </div>
      </div>
    </AppTabShell>
  );
};
