import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, MobileFormLayout, MobileShell } from '@butler/ui';
import { getTicket, patchTicket, postDocumentDownloadUrl } from '@butler/api-client';
import { Check, Wrench } from 'lucide-react';
import { isUnauthorizedError, toApiError } from '../../shared/apiError';
import { SharedDocuments } from '../../shared/documentViewer/SharedDocuments';
import { getRoomLabel } from '../../shared/room';
import { getTicketCategoryLabel } from '../../shared/ticketLabels';
import { TicketStepBar } from '../components/TicketStepBar/TicketStepBar';
import { useLoad } from '../hooks/useLoad';
import { useTenantTabs } from '../hooks/useTenantTabs';
import { ticketEditPath, TICKETS_PATH } from '../routes';
import { canChangeTicket, formatTicketDateTime, formatTicketShortDate, formatTicketShortDateTime, getTenantTicketBadge } from '../utils/tickets';

// 접수 상태의 세로 단계(시안 v2.2 ⑤): 접수만 채우고, 처리 중에는 "임대인이 확인하면 바뀌어요".
const OpenSteps = ({ createdAt }) => (
  <ol aria-label="진행 단계: 접수" className="mt-4">
    <li className="flex gap-3" aria-current="step">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-white" aria-hidden="true">
        <Check size={12} strokeWidth={2.5} />
      </span>
      <div className="pb-4">
        <p className="text-m-label font-semibold text-ink">접수</p>
        <p className="font-num text-m-sub tabular-nums text-ink-3">{formatTicketShortDateTime(createdAt)}</p>
      </div>
    </li>
    <li className="flex gap-3">
      <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-line bg-surface" aria-hidden="true" />
      <div className="pb-4">
        <p className="text-m-label text-ink-3">처리 중</p>
        <p className="text-m-sub text-ink-3">임대인이 확인하면 바뀌어요</p>
      </div>
    </li>
    <li className="flex gap-3">
      <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-line bg-surface" aria-hidden="true" />
      <p className="text-m-label text-ink-3">완료</p>
    </li>
  </ol>
);

const TicketBody = ({ ticket }) => {
  const badge = getTenantTicketBadge(ticket.status);
  const roomLabel = getRoomLabel(ticket.room);
  const isDone = ticket.status === 'DONE';
  return (
    <div className="space-y-4">
      <section className="rounded-card border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge mobile tone={badge.tone}>
            {badge.label}
          </Badge>
          <Badge mobile>{getTicketCategoryLabel(ticket.category)}</Badge>
          {roomLabel && <span className="rounded-chip border border-line bg-surface px-2 py-0.5 text-chip font-semibold text-ink-2">{roomLabel}</span>}
        </div>
        <h1 className="mt-2 text-[18px] font-bold leading-snug text-ink">{ticket.title}</h1>
        <p className="mt-1 text-m-sub text-ink-3">
          {ticket.property?.displayName} · <span className="font-num tabular-nums">{formatTicketDateTime(ticket.createdAt)}</span> 요청
        </p>
        {ticket.status === 'OPEN' && <OpenSteps createdAt={ticket.createdAt} />}
        {(ticket.status === 'IN_PROGRESS' || isDone) && (
          <div className="mt-4">
            <TicketStepBar status={ticket.status} doneLabel={formatTicketShortDate(ticket.closedAt)} />
          </div>
        )}
        {ticket.status === 'CANCELED' && (
          <p className="mt-3 rounded-input bg-surface-2 px-3 py-2 text-m-sub text-ink-2">
            취소된 요청이에요 · <span className="font-num tabular-nums">{formatTicketShortDate(ticket.closedAt)}</span>
          </p>
        )}
      </section>

      {ticket.resolutionNote && (
        <section className="rounded-card border border-accent/30 bg-accent-soft/40 p-4">
          <h2 className="flex items-center gap-1.5 text-m-label font-semibold text-accent-strong">
            <Wrench size={16} strokeWidth={1.8} aria-hidden="true" />
            처리 내용
          </h2>
          <p className="mt-1.5 whitespace-pre-line text-body text-ink">{ticket.resolutionNote}</p>
        </section>
      )}

      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-m-label font-semibold text-ink-2">{isDone ? '내가 보낸 내용' : '내용'}</h2>
        <p className="mt-1.5 whitespace-pre-line text-body text-ink">{ticket.description}</p>
      </section>

      {ticket.attachments?.length > 0 && <SharedDocuments documents={ticket.attachments} fetchUrl={postDocumentDownloadUrl} title="첨부" />}
    </div>
  );
};

// 임차인 요청 상세(시안 v2.2 ⑤⑥). 접수(OPEN)면 아래 고정 칸에 [수정][요청 취소](하단 탭 없음), 그 밖에는 하단 탭이 있는 상세.
// 처리 비용은 서버가 임차인에게 null로 주므로 보이지 않는다.
export const TicketDetailPage = ({ onUnauthorized }) => {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = useTenantTabs();
  const ticket = useLoad(`tenant-ticket:${ticketId}`, () => getTicket(ticketId), { onUnauthorized });
  const [confirming, setConfirming] = useState(false);
  const [cancel, setCancel] = useState({ isLoading: false, error: null });

  const goBack = () => (location.key === 'default' ? navigate(TICKETS_PATH, { replace: true }) : navigate(-1));
  const topBar = { title: '요청 상세', onBack: goBack };

  const handleCancel = async () => {
    setCancel({ isLoading: true, error: null });
    try {
      await patchTicket(ticketId, { status: 'CANCELED' });
      setConfirming(false);
      setCancel({ isLoading: false, error: null });
      ticket.refetch();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onUnauthorized?.();
        return;
      }
      setCancel({ isLoading: false, error: toApiError(error) });
      ticket.refetch();
    }
  };

  const content = (
    <>
      {ticket.isLoading && !ticket.data && (
        <p role="status" className="text-body text-ink-3">
          요청을 불러오는 중이에요
        </p>
      )}
      {ticket.error && (
        <Card>
          <p role="alert" className="text-body text-crit-ink">
            {ticket.error.status === 404 ? '요청을 찾을 수 없어요.' : ticket.error.message}
          </p>
          {ticket.error.status !== 404 && (
            <Button variant="secondary" size="h44" className="mt-3 w-full" onClick={ticket.refetch}>
              다시 불러오기
            </Button>
          )}
        </Card>
      )}
      {ticket.data && <TicketBody ticket={ticket.data} />}
      {cancel.error && (
        <p role="alert" className="text-m-sub text-crit-ink">
          {cancel.error.message}
        </p>
      )}
    </>
  );

  if (ticket.data && canChangeTicket(ticket.data)) {
    const cta = confirming ? (
      <div className="flex w-full flex-col gap-2">
        <p className="text-center text-m-sub text-ink-2">이 요청을 취소할까요? 취소하면 되돌릴 수 없어요.</p>
        <div className="flex gap-2.5">
          <Button variant="secondary" size="h52" className="flex-1" disabled={cancel.isLoading} onClick={() => setConfirming(false)}>
            돌아가기
          </Button>
          <Button variant="secondary" size="h52" className="flex-1 !text-crit-ink" disabled={cancel.isLoading} onClick={handleCancel}>
            {cancel.isLoading ? '취소하는 중' : '요청 취소하기'}
          </Button>
        </div>
      </div>
    ) : (
      <div className="flex w-full flex-col gap-2">
        <div className="flex gap-2.5">
          <Button variant="secondary" size="h52" className="flex-1" onClick={() => navigate(ticketEditPath(ticketId))}>
            수정
          </Button>
          <Button variant="secondary" size="h52" className="flex-1 !text-crit-ink" onClick={() => setConfirming(true)}>
            요청 취소
          </Button>
        </div>
        <p className="text-center text-m-sub text-ink-3">임대인이 처리를 시작하면 고칠 수 없어요.</p>
      </div>
    );
    return (
      <MobileFormLayout shell="tenant-form" topBar={topBar} cta={cta}>
        {content}
      </MobileFormLayout>
    );
  }

  return (
    <MobileShell shell="tenant" backBar={topBar} tabs={tabs}>
      <div className="space-y-4">{content}</div>
    </MobileShell>
  );
};
