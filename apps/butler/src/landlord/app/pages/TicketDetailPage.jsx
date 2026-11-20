import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { postDocumentDownloadUrl } from '@butler/api-client';
import { Badge, Button, MobileFormLayout } from '@butler/ui';
import { DocumentViewer } from '../../../shared/documentViewer/DocumentViewer';
import { isVideoDocument } from '../../../shared/documentViewer/documentFiles';
import { useDocumentUrls } from '../../../shared/documentViewer/useDocumentUrls';
import { DocumentThumbnail } from '../../web/components/DocumentThumbnail/DocumentThumbnail';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { formatAttachmentCount } from '../../web/utils/attachment';
import { useGetTicket } from '../../web/hooks/useGetTicket';
import { useOpenThread } from '../../web/hooks/useOpenThread';
import { usePatchTicket } from '../../web/hooks/usePatchTicket';
import { formatUnitLabel } from '../../web/utils/unitAddress';
import { BottomSheet } from '../components/BottomSheet/BottomSheet';
import { useGoBack, useGoTo } from '../utils/navigation';
import {
  canCancelTicket,
  canOpenTicketThread,
  getPrimaryTicketAction,
  getTicketStatusBadge,
  toCompleteBody,
  toTicketRows,
} from '../utils/ticketView';

const CARD_CLASS = 'rounded-card border border-line bg-surface';
const TEXTAREA_CLASS =
  'min-h-28 w-full rounded-input border border-line bg-surface px-3 py-2.5 text-body text-ink outline-none focus:border-accent disabled:bg-surface-2';
const MAX_RESOLUTION_NOTE_LENGTH = 3000;

// 완료 처리: 처리 내용(선택)·비용(선택)을 적고 DONE 으로 바꾼다. 완료되면 서버가 관리 로그(TICKET_SUMMARY)를 자동으로 남긴다.
const CompleteSheet = ({ isSubmitting, error, onSubmit, onClose }) => {
  const [resolutionNote, setResolutionNote] = useState('');
  const [cost, setCost] = useState('');

  return (
    <BottomSheet label="완료 처리" onClose={onClose}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(toCompleteBody({ resolutionNote, cost }));
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ticket-resolution-note" className="text-m-label font-semibold text-ink">
            처리 내용 (선택)
          </label>
          <textarea
            id="ticket-resolution-note"
            value={resolutionNote}
            maxLength={MAX_RESOLUTION_NOTE_LENGTH}
            disabled={isSubmitting}
            onChange={(event) => setResolutionNote(event.target.value)}
            placeholder="예) 보일러 순환 펌프 교체"
            className={TEXTAREA_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ticket-cost" className="text-m-label font-semibold text-ink">
            비용 (선택)
          </label>
          <div className="flex h-12 items-center gap-2 rounded-input border border-line bg-surface px-3.5 focus-within:border-accent">
            <input
              id="ticket-cost"
              inputMode="numeric"
              value={cost}
              disabled={isSubmitting}
              onChange={(event) => setCost(event.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
              className="min-w-0 flex-1 bg-transparent font-num text-num-body tabular-nums text-ink outline-none"
            />
            <span className="text-m-sub text-ink-3">원</span>
          </div>
          <p className="text-m-sub text-ink-3">비용은 임대인에게만 보여요.</p>
        </div>
        <p className="rounded-input bg-surface-2 px-4 py-3 text-m-sub text-ink-2">완료하면 처리 내용이 관리 로그에 자동으로 기록되고, 이후에는 바꿀 수 없어요.</p>
        {error && <NoticeBox>{error}</NoticeBox>}
        <div className="flex gap-2.5">
          <Button variant="secondary" size="h52" onClick={onClose} disabled={isSubmitting}>
            닫기
          </Button>
          <Button type="submit" size="h52" className="flex-1" disabled={isSubmitting}>
            {isSubmitting ? '처리 중' : '완료 처리'}
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
};

const CancelSheet = ({ isSubmitting, error, onConfirm, onClose }) => (
  <BottomSheet label="요청 취소" onClose={onClose}>
    <p className="text-body text-ink-2">이 요청을 취소할까요? 취소한 요청은 다시 열 수 없어요.</p>
    {error && <NoticeBox>{error}</NoticeBox>}
    <div className="flex gap-2.5">
      <Button variant="secondary" size="h52" className="flex-1" onClick={onClose} disabled={isSubmitting}>
        닫기
      </Button>
      <Button size="h52" className="flex-1" onClick={onConfirm} disabled={isSubmitting}>
        {isSubmitting ? '취소 중' : '요청 취소'}
      </Button>
    </div>
  </BottomSheet>
);

// 임대인 앱 수리·점검 요청 상세 (M09 카드를 눌렀을 때). 하단 고정 바에 대화하기·처리 시작/완료 처리.
// openComplete: 목록의 [완료 처리]로 들어오면 완료 시트를 바로 연다.
export const TicketDetailPage = ({ ticketId, openComplete = false, onUnauthorized }) => {
  const goTo = useGoTo();
  const goBack = useGoBack('tickets');
  const { data: ticket, error, setData } = useGetTicket(ticketId, { onUnauthorized });
  const { updateTicket, isLoading: isUpdating } = usePatchTicket({ onUnauthorized });
  const { openThread, isLoading: isOpening } = useOpenThread({ onUnauthorized });
  const [sheet, setSheet] = useState(openComplete ? 'complete' : null);
  const [actionError, setActionError] = useState(null);
  // 동영상 첨부는 새 탭(MOV는 브라우저가 내려받아 버린다) 대신 공용 뷰어에서 재생한다.
  const [playing, setPlaying] = useState(null);
  const urls = useDocumentUrls(postDocumentDownloadUrl);

  if (!ticket) {
    return (
      <MobileFormLayout shell="landlord-app-detail" topBar={{ title: '수리·점검', onBack: goBack }}>
        {error ? (
          <NoticeBox>{error.message}</NoticeBox>
        ) : (
          <p role="status" className="py-10 text-center text-body text-ink-3">
            불러오는 중입니다
          </p>
        )}
      </MobileFormLayout>
    );
  }

  const badge = getTicketStatusBadge(ticket.status);
  const action = getPrimaryTicketAction(ticket);
  const canChat = canOpenTicketThread(ticket);
  const busy = isUpdating || isOpening;
  // 이미 끝난 요청이면 목록에서 들고 온 완료 시트를 열지 않는다.
  const openSheet = action === 'COMPLETE' || sheet === 'cancel' ? sheet : null;

  const closeSheet = () => {
    setSheet(null);
    setActionError(null);
  };

  const patch = async (body) => {
    setActionError(null);
    const result = await updateTicket(ticket.id, body);
    if (result.error) {
      setActionError(result.error.message);
      return;
    }
    if (result.data) {
      setData(result.data);
      setSheet(null);
    }
  };

  const handleChat = async () => {
    setActionError(null);
    const result = await openThread('TICKET', ticket.id);
    if (result.error) setActionError(result.error.message);
    else if (result.data) goTo('thread', { threadId: result.data.id });
  };

  const rows = toTicketRows(ticket);

  return (
    <MobileFormLayout
      shell="landlord-app-detail"
      topBar={{ title: '수리·점검', onBack: goBack }}
      overlay={
        openSheet === 'complete' ? (
          <CompleteSheet isSubmitting={isUpdating} error={actionError} onSubmit={patch} onClose={closeSheet} />
        ) : openSheet === 'cancel' ? (
          <CancelSheet isSubmitting={isUpdating} error={actionError} onConfirm={() => patch({ status: 'CANCELED' })} onClose={closeSheet} />
        ) : null
      }
      cta={
        (canChat || action) && (
          <>
            {canChat && (
              <Button variant="secondary" size="h52" className={action ? '' : 'flex-1'} disabled={busy} onClick={handleChat}>
                대화하기
              </Button>
            )}
            {action === 'START' && (
              <Button size="h52" className="flex-1" disabled={busy} onClick={() => patch({ status: 'IN_PROGRESS' })}>
                {isUpdating ? '처리 중' : '처리 시작'}
              </Button>
            )}
            {action === 'COMPLETE' && (
              <Button size="h52" className="flex-1" disabled={busy} onClick={() => setSheet('complete')}>
                완료 처리
              </Button>
            )}
          </>
        )
      }
    >
      {actionError && !openSheet && <NoticeBox>{actionError}</NoticeBox>}

      <section aria-label="요청 내용" className={`${CARD_CLASS} flex flex-col gap-2 p-4`}>
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-m-card font-semibold text-ink">{ticket.title}</h2>
          <Badge mobile tone={badge.tone} className="shrink-0">
            {badge.label}
          </Badge>
        </div>
        <p className="text-m-sub text-ink-3">
          {ticket.property.complex.name} {formatUnitLabel(ticket.property.buildingNo, ticket.property.unitNo)}
        </p>
        <p className="whitespace-pre-wrap text-body text-ink-2">{ticket.description}</p>
      </section>

      <section aria-label="요청 정보" className={`${CARD_CLASS} px-4`}>
        <dl>
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0">
              <dt className="shrink-0 text-m-label text-ink-3">{row.label}</dt>
              <dd className={`min-w-0 text-right text-body text-ink ${row.numeric ? 'font-num tabular-nums' : ''}`}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {ticket.resolutionNote && (
        <section aria-label="처리 내용" className={`${CARD_CLASS} flex flex-col gap-1.5 p-4`}>
          <h2 className="text-m-label font-semibold text-ink-3">처리 내용</h2>
          <p className="whitespace-pre-wrap text-body text-ink">{ticket.resolutionNote}</p>
        </section>
      )}

      {ticket.attachments.length > 0 && (
        // 동영상이 섞이면 '첨부 n개'. 동영상 칸은 누르면 새 탭에서 재생한다(DocumentThumbnail).
        <section aria-label="첨부" className="flex flex-col gap-2">
          <h2 className="text-m-label font-semibold text-ink-3">{formatAttachmentCount(ticket.attachments)}</h2>
          <ul className="grid grid-cols-3 gap-2">
            {ticket.attachments.map((document) => (
              <li key={document.id}>
                <DocumentThumbnail
                  document={document}
                  onUnauthorized={onUnauthorized}
                  onOpen={isVideoDocument(document) ? () => setPlaying(document) : undefined}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {ticket.historyLogId && (
        <button
          type="button"
          onClick={() => goTo('logDetail', { logId: ticket.historyLogId })}
          className={`${CARD_CLASS} flex items-center justify-between gap-2 p-4 text-left text-body text-ink`}
        >
          관리 로그에 남은 기록 보기
          <ChevronRight size={18} className="text-ink-3" aria-hidden="true" />
        </button>
      )}

      {canCancelTicket(ticket) && (
        <button type="button" disabled={busy} onClick={() => setSheet('cancel')} className="self-center py-2 text-m-sub text-ink-3 underline disabled:opacity-50">
          요청 취소
        </button>
      )}
      {playing && <DocumentViewer documents={[playing]} urls={urls} onClose={() => setPlaying(null)} />}
    </MobileFormLayout>
  );
};
