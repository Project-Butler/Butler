import { BookOpen, ExternalLink, FileText, MessageSquare, Scale } from 'lucide-react';
import { CONTACTS, DATA_SOURCES } from '../../utils/disputePortal';

const SOURCE_ICONS = { 조정사례: FileText, 상담사례: MessageSquare, '판례·법령': Scale, 가이드: BookOpen };

// 맨 아래 자료 출처(확인용이라 가볍게). Perplexity 출처 칩처럼 아이콘 + 자료 이름 알약 링크 한 줄, 긴 설명은 마우스를 올리면 보인다.
// 링크는 기관 메인이 아니라 해당 자료 페이지로. 연락처는 첫 화면에선 도움받을 곳 카드 안에 있어서,
// 그 카드가 없는 화면(자료 찾기)만 showContacts로 한 줄 덧붙인다. 레퍼런스 비교는 doc/근거조사 11-12 절.
export const SourceFooter = ({ showContacts = false }) => (
  <footer className="flex flex-col gap-3 border-t border-line pt-4">
    <section aria-label="자료 출처" className="flex flex-wrap items-center gap-1.5">
      <h3 className="mr-1 text-sub font-semibold text-ink-3">자료 출처</h3>
      <ul className="contents">
        {DATA_SOURCES.map((source) => {
          const Icon = SOURCE_ICONS[source.label] ?? FileText;
          return (
            <li key={source.detail}>
              <a
                href={source.href}
                target="_blank"
                rel="noreferrer"
                title={source.detail}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sub text-ink-2 transition-colors hover:border-accent hover:text-ink"
              >
                <Icon size={14} className="shrink-0 text-accent" />
                {source.title}
                <ExternalLink size={12} className="shrink-0 text-ink-3" />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
    {showContacts && (
      <section aria-label="기관 연락처" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sub">
        <h3 className="font-semibold text-ink-3">기관 연락처</h3>
        <ul className="contents">
          {CONTACTS.map((contact) => (
            <li key={contact.key} className="flex items-center gap-1.5">
              <span className="text-ink-2">{contact.short}</span>
              <a
                href={contact.href}
                aria-label={`${contact.name} ${contact.value} 전화 걸기`}
                className="font-num font-semibold tabular-nums text-accent hover:text-accent-strong"
              >
                {contact.value}
              </a>
            </li>
          ))}
        </ul>
      </section>
    )}
  </footer>
);
