// 임차인 수리 요청 화면의 표시 계산(시안 v2.2, docs/10 D7·D15). 화면 밖에서 테스트할 수 있게 순수 함수로 둔다.
import { getTicketStatusLabel } from '../../shared/ticketLabels';

// 요청할 수 있는 계약 상태(서버 TICKET_REQUESTABLE_CONTRACT_STATUSES와 같다): 시작 전·진행 중·만료 임박.
const REQUESTABLE_CONTRACT_STATUSES = ['UPCOMING', 'ACTIVE', 'EXPIRING_SOON'];

// 상태 칩: 글자는 shared 임차인 문구, 색은 임대인 앱과 같다(처리 중 = 점선 pending).
const STATUS_TONES = { OPEN: 'warning', IN_PROGRESS: 'pending', DONE: 'success', CANCELED: 'default' };
export const getTenantTicketBadge = (status) => ({ label: getTicketStatusLabel(status, 'TENANT'), tone: STATUS_TONES[status] ?? 'default' });

// 진행 단계(접수 → 처리 중 → 완료). 지금 단계 번호(0~2). 취소는 -1(단계 막대를 그리지 않는다).
export const TICKET_STEPS = ['접수', '처리 중', '완료'];
export const getTicketStepIndex = (status) => ({ OPEN: 0, IN_PROGRESS: 1, DONE: 2 })[status] ?? -1;

// 요청자가 고칠 수 있는지: 접수(OPEN)이고 서버가 읽기 전용이라 하지 않을 때만(D7 — 처리 중 취소는 서버가 받아도 화면은 막는다).
export const canChangeTicket = (ticket) => ticket?.status === 'OPEN' && !ticket.isReadOnly;

// 요청할 수 있는 집: 요청 가능한 계약의 호실(같은 호실은 한 번). { propertyId, displayName }
export const toRequestableHomes = (contracts = []) => {
  const homes = new Map();
  for (const contract of contracts) {
    if (!REQUESTABLE_CONTRACT_STATUSES.includes(contract.status) || !contract.property?.id) continue;
    if (!homes.has(contract.property.id)) homes.set(contract.property.id, { propertyId: contract.property.id, displayName: contract.property.displayName });
  }
  return [...homes.values()];
};

// 'MM-DD HH:mm'(한국 시간, 목록 카드) / 'YYYY-MM-DD HH:mm'(상세). 값이 없으면 null.
const toKst = (isoString) => new Date(isoString).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
export const formatTicketDateTime = (isoString) => (isoString ? toKst(isoString) : null);
export const formatTicketShortDateTime = (isoString) => (isoString ? toKst(isoString).slice(5) : null);
export const formatTicketShortDate = (isoString) => (isoString ? toKst(isoString).slice(5, 10) : null);

// 수정 화면이 보낼 칸: 바뀐 것만(제목·설명·방). 바뀐 게 없으면 빈 객체.
export const buildTicketChanges = (ticket, form) => {
  const changes = {};
  if (form.title.trim() !== ticket.title) changes.title = form.title.trim();
  if (form.description.trim() !== ticket.description) changes.description = form.description.trim();
  if ((form.room || null) !== (ticket.room ?? null)) changes.room = form.room || null;
  return changes;
};
