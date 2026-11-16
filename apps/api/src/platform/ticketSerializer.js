// 티켓 응답 직렬화(DB 의존 없음). 목록·상세·쓰기 응답이 모두 이 함수를 쓴다(계약 5장).
import { toAttachmentResponse } from './documentAttachments.js';
import { toMoney } from './money.js';
import { toPropertySummary } from './propertySerializer.js';
import { canEditTicket } from './ticketRules.js';

// 응답을 만들려면 이 include가 있어야 한다.
export const TICKET_INCLUDE = {
  property: { include: { complex: true } },
  ownership: { select: { id: true, userId: true, endedAt: true } },
  requester: { select: { id: true, name: true, role: true } },
};

const toIsoOrNull = (date) => (date ? date.toISOString() : null);

export const toTicketResponse = (ticket, user) => ({
  id: ticket.id,
  propertyId: ticket.propertyId,
  property: toPropertySummary(ticket.property),
  contractId: ticket.contractId ?? null,
  category: ticket.category,
  title: ticket.title,
  description: ticket.description,
  status: ticket.status,
  resolutionNote: ticket.resolutionNote ?? null,
  // 처리 비용은 그 호실의 임대인(이 티켓을 처리하는 소유자)에게만 보인다. 임차인·운영자에게는 null.
  cost: ticket.ownership.userId === user.id ? (toMoney(ticket.cost) ?? null) : null,
  requester: ticket.requester,
  // DONE이 되면 자동으로 만든 TICKET_SUMMARY 관리 로그
  historyLogId: ticket.logId ?? null,
  // 붙은 문서(숨기지 않은 것, 올린 순서). 행에 attachments를 붙여 넘긴다(documentAttachments.withAttachments).
  attachments: (ticket.attachments ?? []).map(toAttachmentResponse),
  isReadOnly: !canEditTicket(ticket, user),
  closedAt: toIsoOrNull(ticket.closedAt),
  createdAt: ticket.createdAt.toISOString(),
  updatedAt: ticket.updatedAt.toISOString(),
});
