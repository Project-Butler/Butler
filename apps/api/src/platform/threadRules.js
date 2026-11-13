// 소통 스레드 규칙(DB 의존 없음). 계약 6장 "소통", 10장 ThreadContextType.
import { daysBetween, toDateOnlyString } from './dateUtils.js';
import { formatDisplayName } from './unitAddress.js';

// 등록형(10장). 피처가 추가하면 여기에 넣는다.
export const THREAD_CONTEXT_TYPES = ['CONTRACT', 'TICKET'];
// 컨텍스트가 끝나고 이 기간이 지나면 읽기 전용이다.
export const THREAD_READ_ONLY_AFTER_DAYS = 30;
export const MAX_MESSAGE_BODY_LENGTH = 2000;
export const MAX_MESSAGE_ATTACHMENTS = 5;
export const DEFAULT_MESSAGE_PAGE_SIZE = 30;
export const MAX_MESSAGE_PAGE_SIZE = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

// 컨텍스트가 끝난 지 30일이 지났거나 임대인 소유 관계가 끝났으면 읽기 전용.
// context: { ownershipEndedAt, contractEndOn('YYYY-MM-DD', 계약), closedAt(Date, 티켓) }
export const isThreadContextReadOnly = (context, { now = new Date(), todayKST }) => {
  if (context.ownershipEndedAt) return true;
  if (context.contractEndOn) return daysBetween(context.contractEndOn, todayKST) > THREAD_READ_ONLY_AFTER_DAYS;
  if (context.closedAt) return now.getTime() - context.closedAt.getTime() > THREAD_READ_ONLY_AFTER_DAYS * DAY_MS;
  return false;
};

// 계약이 끝나는 날: 해지일이 있으면 해지일, 없으면 종료일.
export const contractEndOn = (contract) => toDateOnlyString(contract.terminatedOn ?? contract.endDate);

// 스레드 제목. 예: '101동 1203호 계약', '101동 1203호 · 보일러 누수'
export const formatThreadTitle = (contextType, { property, ticketTitle }) => {
  const unit = formatDisplayName('', property.buildingNo, property.unitNo).trim();
  return contextType === 'TICKET' ? `${unit} · ${ticketTitle}` : `${unit} 계약`;
};
