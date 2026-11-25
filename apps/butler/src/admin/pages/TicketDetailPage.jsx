import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card } from '@butler/ui';
import { ChevronLeft } from 'lucide-react';
import { postDocumentDownloadUrl } from '@butler/api-client';
import { StatusMessage } from '../components/StatusMessage/StatusMessage';
import { ROLE_LABEL, TICKET_STATUS_TONE } from '../constants/labels';
import { useGetAdminTicket } from '../hooks/useGetAdminTicket';
import { formatDateTime } from '../utils/formatDate';
import { SharedDocuments } from '../../shared/documentViewer/SharedDocuments';
import { getRoomLabel } from '../../shared/room';
import { getTicketCategoryLabel, getTicketStatusLabel } from '../../shared/ticketLabels';

const InfoRow = ({ label, children }) => (
  <div className="flex gap-4 py-2">
    <dt className="w-28 shrink-0 text-chip font-medium text-ink-3">{label}</dt>
    <dd className="min-w-0 text-body text-ink">{children ?? '-'}</dd>
  </div>
);

// 유지보수(수리·점검 요청) 상세(읽기 전용). 운영자는 처리하지 않는다 — 상태·처리 메모·비용은 그 호실의 활성 소유자만 바꾼다(계약 5장).
// 처리 비용(cost)은 서버가 운영자에게 null로 주므로 보여 주지 않는다.
export const TicketDetailPage = ({ onNavigate, onUnauthorized }) => {
  const { ticketId } = useParams();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const { data: ticket, error, isLoading, refetch } = useGetAdminTicket(ticketId, { onUnauthorized });

  // 다른 화면에서 왔으면 뒤로 가고(목록의 필터·쪽 번호 유지), 주소로 바로 들어왔으면 목록으로 보낸다.
  const goBack = () => (location.key === 'default' ? onNavigate('tickets') : routerNavigate(-1));
  const openAuditLogs = () =>
    onNavigate('auditLogs', undefined, `?${new URLSearchParams({ resourceType: 'TICKET', resourceId: ticketId })}`);

  return (
    <div className="space-y-4">
      <button type="button" onClick={goBack} className="flex items-center gap-1 text-body text-ink-2 hover:text-ink">
        <ChevronLeft size={18} aria-hidden="true" />
        뒤로
      </button>

      {error && (
        <Card className="p-5">
          <StatusMessage tone="error" onRetry={error.code === 'TICKET_NOT_FOUND' ? undefined : refetch}>
            {error.message}
          </StatusMessage>
        </Card>
      )}
      {isLoading && !ticket && <StatusMessage>불러오는 중입니다</StatusMessage>}

      {ticket && (
        <>
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-body text-ink-2">{ticket.property?.displayName ?? '-'}</p>
              <div className="mt-1 flex items-center gap-2">
                <h2 className="truncate text-h1 font-bold text-ink">{ticket.title}</h2>
                <Badge tone={TICKET_STATUS_TONE[ticket.status]}>{getTicketStatusLabel(ticket.status, 'ADMIN')}</Badge>
              </div>
              <p className="mt-1 font-num text-chip text-ink-3">{ticket.id}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={openAuditLogs}>
              이 요청의 감사 로그
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="text-body font-semibold text-ink">요청 내용</h3>
              <dl className="mt-2 divide-y divide-line">
                <InfoRow label="분류">{getTicketCategoryLabel(ticket.category)}</InfoRow>
                <InfoRow label="위치">{getRoomLabel(ticket.room)}</InfoRow>
                <InfoRow label="요청자">
                  {ticket.requester && (
                    <button
                      type="button"
                      onClick={() => onNavigate('userDetail', { userId: ticket.requester.id })}
                      className="text-accent hover:underline"
                    >
                      {ticket.requester.name}
                    </button>
                  )}
                  {ticket.requester?.role && <span className="ml-2 text-chip text-ink-3">{ROLE_LABEL[ticket.requester.role] ?? ticket.requester.role}</span>}
                </InfoRow>
                <InfoRow label="접수">
                  <span className="font-num">{formatDateTime(ticket.createdAt)}</span>
                </InfoRow>
                <InfoRow label="계약">
                  {ticket.contractId && (
                    <button
                      type="button"
                      onClick={() => onNavigate('contractDetail', { contractId: ticket.contractId })}
                      className="font-num text-chip text-accent hover:underline"
                    >
                      {ticket.contractId}
                    </button>
                  )}
                </InfoRow>
              </dl>
              <p className="mt-3 whitespace-pre-wrap rounded-btn bg-surface-2 p-3 text-body text-ink">{ticket.description}</p>
            </Card>

            <Card className="p-5">
              <h3 className="text-body font-semibold text-ink">처리</h3>
              <dl className="mt-2 divide-y divide-line">
                <InfoRow label="상태">{getTicketStatusLabel(ticket.status, 'ADMIN')}</InfoRow>
                <InfoRow label="처리 메모">
                  {ticket.resolutionNote && <span className="whitespace-pre-wrap">{ticket.resolutionNote}</span>}
                </InfoRow>
                <InfoRow label="끝난 시각">
                  {ticket.closedAt && <span className="font-num">{formatDateTime(ticket.closedAt)}</span>}
                </InfoRow>
                <InfoRow label="하우스 로그">{ticket.historyLogId ? '완료 요약 기록됨' : null}</InfoRow>
              </dl>
            </Card>
          </div>

          {ticket.attachments?.length > 0 && (
            <Card className="p-5">
              <SharedDocuments documents={ticket.attachments} fetchUrl={postDocumentDownloadUrl} title="첨부" />
            </Card>
          )}

          <p className="text-chip text-ink-3">마지막 변경 {formatDateTime(ticket.updatedAt)}</p>
        </>
      )}
    </div>
  );
};
