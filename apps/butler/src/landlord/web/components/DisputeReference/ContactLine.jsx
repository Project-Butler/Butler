import { Phone } from 'lucide-react';
import { CONTACTS } from '../../utils/disputePortal';

// 기관 카드 안의 전화 한 줄(☎ 번호 + 공식 확인된 운영시간·요금). 기관 카드가 나오는 곳(첫 화면·상황 안내)에만 둔다.
export const ContactLine = ({ routeKey, className = '' }) => {
  const contact = CONTACTS.find((item) => item.key === routeKey);
  if (!contact) return null;
  return (
    <span className={`flex flex-wrap items-center gap-x-2 text-sub ${className}`}>
      <a
        href={contact.href}
        aria-label={`${contact.name} ${contact.value} 전화 걸기`}
        className="flex min-h-9 items-center gap-1 font-num font-semibold tabular-nums text-ink-2 hover:text-accent"
      >
        <Phone size={14} />
        {contact.value}
      </a>
      {contact.note && <span className="text-ink-3">{contact.note}</span>}
    </span>
  );
};
