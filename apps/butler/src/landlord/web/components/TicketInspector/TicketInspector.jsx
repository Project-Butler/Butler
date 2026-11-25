import { useEffect, useState } from 'react';
import { Badge, Button } from '@butler/ui';
import { CalendarCheck, CalendarDays, CheckCircle2, ClipboardList, Coins, MessageCircle, User, Wrench, X } from 'lucide-react';
import { getTicketCategoryLabel } from '../../../../shared/ticketLabels';
import { DocumentThumbnail } from '../DocumentThumbnail/DocumentThumbnail';
import { EmptyState } from '../EmptyState/EmptyState';
import { IconTile } from '../IconTile/IconTile';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { RoomChip } from '../RoomChip/RoomChip';
import { useDocumentPreview } from '../../hooks/useDocumentPreview';
import { useGetTicket } from '../../hooks/useGetTicket';
import { usePatchTicket } from '../../hooks/usePatchTicket';
import { formatWon } from '../../utils/contract';
import { canCancelTicket, formatTicketDateTime, getPrimaryTicketAction, getRequesterLabel, getTicketStatusBadge } from '../../utils/ticketView';

const InfoRow = ({ icon: Icon, label, children }) => (
  <div className="flex items-center gap-3 py-1.5 text-body">
    <Icon size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
    <span className="w-14 shrink-0 text-sub text-ink-3">{label}</span>
    <span className="min-w-0 flex-1 font-num tabular-nums text-ink">{children}</span>
  </div>
);

// 요청 취소: 한 번 더 묻는다.
const CancelRow = ({ busy, onCancel }) => {
  const [isConfirming, setIsConfirming] = useState(false);
  if (!isConfirming) {
    return (
      <Button variant="secondary" size="h44" className="text-crit-ink" disabled={busy} onClick={() => setIsConfirming(true)}>
        요청 취소
      </Button>
    );
  }
  return (
    <div className="w-full space-y-2 rounded-input bg-surface-2 p-3">
      <p className="text-sub text-ink-2">이 요청을 취소할까요? 취소하면 되돌릴 수 없어요.</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="h44" disabled={busy} onClick={() => setIsConfirming(false)}>
          돌아가기
        </Button>
        <Button size="h44" disabled={busy} onClick={onCancel}>
          {busy ? '취소하는 중' : '요청 취소하기'}
        </Button>
      </div>
    </div>
  );
};

// PC 수리 요청 상세 패널(시안 v2.2 ①~③). 표 오른쪽 3칸.
// - 확인 필요: [요청 취소][처리 시작](바로 처리 중으로) · 처리 중: [요청 취소][완료 처리](onComplete 로 팝업) · 완료: [하우스 로그 보기].
// - 대화는 개수·조회 없이 안내 한 줄(HL H-16). 첨부는 미리보기 팝업(사진·동영상·PDF).
// - canProcess(ticket): 처리 시작·완료 버튼을 보일지(지금 소유 중인 호실인지).
// - onChanged(ticket): 상태가 바뀌면 표·개수를 새로 고치게 알린다. onLoaded(ticket): 처음 불러왔을 때.
export const TicketInspector = ({ ticketId, canProcess = () => false, onClose, onComplete, onChanged, onLoaded, onNavigate, onUnauthorized }) => {
  const { data: ticket, error, setData } = useGetTicket(ticketId, { onUnauthorized });
  const loadedId = ticket?.id;
  // 처음 불러왔을 때 한 번 알린다(완료 팝업을 바로 열라는 주소 처리용).
  useEffect(() => {
    if (loadedId) onLoaded?.(ticket);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId]);
  const { updateTicket, isLoading: isSaving, error: saveError } = usePatchTicket({ onUnauthorized });
  const { openPreview, preview } = useDocumentPreview({ onUnauthorized });

  const frame = (children) => (
    <aside aria-label="요청 상세" className="tickets-page__inspector-panel sticky top-6 col-span-3 self-start overflow-hidden rounded-card border border-line bg-surface">
      {children}
    </aside>
  );

  if (!ticketId) {
    return frame(<EmptyState icon={Wrench} title="요청을 고르세요" description="표에서 요청을 누르면 내용·첨부·처리 버튼을 여기서 봐요." />);
  }
  if (!ticket) {
    return frame(
      <div className="p-5">
        {error ? <NoticeBox>{error.status === 404 ? '요청을 찾을 수 없어요.' : error.message}</NoticeBox> : <p className="py-6 text-center text-body text-ink-3">불러오는 중입니다</p>}
      </div>,
    );
  }

  const badge = getTicketStatusBadge(ticket.status);
  // 처리 시작·완료는 지금 소유 중인 호실의 요청만(직접 등록한 요청은 소유가 끝나도 취소만 할 수 있다).
  const action = canProcess(ticket) ? getPrimaryTicketAction(ticket) : null;
  const isDone = ticket.status === 'DONE';
  const change = async (body) => {
    const result = await updateTicket(ticket.id, body);
    if (result.data) {
      setData(result.data);
      onChanged?.(result.data);
    }
  };

  return frame(
    <>
      <div className="flex items-start gap-3 border-b border-line p-5">
        <IconTile icon={isDone ? CheckCircle2 : Wrench} tone={isDone ? 'ok' : 'accent'} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sub text-ink-3">{ticket.property?.displayName}</p>
          <h2 className="mt-0.5 break-keep text-section font-semibold text-ink">{ticket.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={badge.tone}>{badge.label}</Badge>
            <Badge>{getTicketCategoryLabel(ticket.category)}</Badge>
            {ticket.room && <RoomChip room={ticket.room} />}
          </div>
        </div>
        <button
          type="button"
          aria-label="요청 상세 닫기"
          onClick={onClose}
          className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-input text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <X size={18} />
        </button>
      </div>
      <div className="px-5 pt-3">
        <InfoRow icon={User} label="요청">
          {getRequesterLabel(ticket)}
        </InfoRow>
        <InfoRow icon={CalendarDays} label="요청일">
          {formatTicketDateTime(ticket.createdAt)}
        </InfoRow>
        {ticket.closedAt && (
          <InfoRow icon={CalendarCheck} label={isDone ? '완료일' : '취소일'}>
            {formatTicketDateTime(ticket.closedAt).slice(0, 10)}
          </InfoRow>
        )}
        {ticket.cost != null && (
          <InfoRow icon={Coins} label="비용">
            <span className="font-semibold">{formatWon(ticket.cost)}</span>
          </InfoRow>
        )}
      </div>
      {ticket.resolutionNote && (
        <div className="px-5 pt-3">
          <p className="mb-2 text-label font-semibold text-ink">처리 내용</p>
          <p className="whitespace-pre-wrap rounded-input bg-accent-soft/50 p-3 text-body text-ink">{ticket.resolutionNote}</p>
        </div>
      )}
      <div className="px-5 pt-3">
        <p className="mb-2 text-label font-semibold text-ink">{isDone && ticket.requester?.role === 'TENANT' ? '임차인이 보낸 내용' : '내용'}</p>
        <p className="whitespace-pre-wrap rounded-input bg-surface-2 p-3 text-body text-ink-2">{ticket.description}</p>
      </div>
      <div className="px-5 py-4">
        <p className="mb-2 text-label font-semibold text-ink">
          첨부 <span className="font-num font-normal tabular-nums text-ink-3">{ticket.attachments.length}</span>
        </p>
        {ticket.attachments.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2">
            {ticket.attachments.map((attachment) => (
              <li key={attachment.id}>
                <DocumentThumbnail document={attachment} onUnauthorized={onUnauthorized} onOpen={(document) => openPreview(document, ticket.attachments)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-ink-3">첨부가 없어요.</p>
        )}
      </div>
      {ticket.requester?.role === 'TENANT' && !isDone && ticket.status !== 'CANCELED' && (
        <p className="mx-5 mb-4 flex items-center gap-1.5 rounded-input border border-line px-3.5 py-2.5 text-sub text-ink-2">
          <MessageCircle size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
          임차인과의 대화는 앱에서 볼 수 있어요
        </p>
      )}
      {isDone && ticket.cost != null && <p className="px-5 pb-4 text-sub text-ink-3">비용은 임대인에게만 보여요.</p>}
      {saveError && <NoticeBox className="mx-5 mb-4">{saveError.message}</NoticeBox>}
      {(action || canCancelTicket(ticket) || ticket.historyLogId) && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
          {canCancelTicket(ticket) && <CancelRow key={ticket.id} busy={isSaving} onCancel={() => change({ status: 'CANCELED' })} />}
          {action === 'START' && (
            <Button size="h44" className="flex-1" disabled={isSaving} onClick={() => change({ status: 'IN_PROGRESS' })}>
              {isSaving ? '바꾸는 중' : '처리 시작'}
            </Button>
          )}
          {action === 'COMPLETE' && (
            <Button size="h44" className="flex-1" disabled={isSaving} onClick={() => onComplete(ticket)}>
              완료 처리
            </Button>
          )}
          {ticket.historyLogId && (
            <Button variant="secondary" size="h44" className="w-full" onClick={() => onNavigate('logDetail', { logId: ticket.historyLogId })}>
              <ClipboardList size={15} className="-ml-0.5 mr-1.5 inline-block" />
              하우스 로그에 남은 기록 보기
            </Button>
          )}
        </div>
      )}
      {preview}
    </>,
  );
};
