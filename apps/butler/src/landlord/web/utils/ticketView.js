// 임대인 앱 수리·점검(M09) 표시 계산. 화면 밖에서 테스트할 수 있게 순수 함수로 둔다.
import { getTicketCategoryLabel, getTicketStatusLabel } from '../../../shared/ticketLabels';
import { formatDateKST, formatNumber } from './format';

// 상태 칩 색. 글자는 shared/ticketLabels(임대인 문구).
const STATUS_TONES = { OPEN: 'warning', IN_PROGRESS: 'pending', DONE: 'success', CANCELED: 'default' };

export const getTicketStatusBadge = (status) => ({ label: getTicketStatusLabel(status, 'LANDLORD'), tone: STATUS_TONES[status] ?? 'default' });

// 'YYYY-MM-DD HH:mm'(한국 시간). 값이 없으면 null.
export const formatTicketDateTime = (isoString) =>
  isoString ? new Date(isoString).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16) : null;

// 요청자 한 줄: 임차인이 올렸으면 '임차인 홍길동 요청', 임대인 본인이 올렸으면 '내가 등록'.
export const getRequesterLabel = (ticket) =>
  ticket.requester?.role === 'TENANT' ? `임차인 ${ticket.requester.name} 요청` : '내가 등록';

// 대화는 임차인이 올린 요청에만 열린다(임대인이 직접 만든 요청은 422 THREAD_CONTEXT_NOT_SUPPORTED).
export const canOpenTicketThread = (ticket) => ticket.requester?.role === 'TENANT';

// 카드·상세의 주 동작. OPEN → 처리 시작(바로 PATCH), IN_PROGRESS → 완료 처리(내용·비용 입력), 끝났으면 없음.
export const getPrimaryTicketAction = (ticket) => {
  if (ticket.isReadOnly) return null;
  if (ticket.status === 'OPEN') return 'START';
  if (ticket.status === 'IN_PROGRESS') return 'COMPLETE';
  return null;
};

export const canCancelTicket = (ticket) => !ticket.isReadOnly && (ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS');

// 상세 정보 행. 값이 없는 행(완료일·처리 내용·비용)은 뺀다. cost 는 소유자에게만 온다.
export const toTicketRows = (ticket) =>
  [
    { label: '유형', value: getTicketCategoryLabel(ticket.category) },
    { label: '요청', value: getRequesterLabel(ticket) },
    { label: '접수일', value: formatTicketDateTime(ticket.createdAt), numeric: true },
    { label: '완료일', value: ticket.status === 'DONE' ? formatDateKST(ticket.closedAt) : null, numeric: true },
    { label: '취소일', value: ticket.status === 'CANCELED' ? formatDateKST(ticket.closedAt) : null, numeric: true },
    { label: '비용', value: ticket.cost != null ? `${formatNumber(ticket.cost)}원` : null, numeric: true },
  ].filter((row) => row.value);

// 완료 처리 입력 → PATCH 바디. 비용은 숫자만 남기고, 비우면 보내지 않는다. 처리 내용도 비우면 보내지 않는다.
export const toCompleteBody = ({ resolutionNote, cost }) => {
  const body = { status: 'DONE' };
  const note = resolutionNote.trim();
  if (note) body.resolutionNote = note;
  const digits = String(cost ?? '').replace(/[^0-9]/g, '');
  if (digits) body.cost = Number(digits);
  return body;
};
