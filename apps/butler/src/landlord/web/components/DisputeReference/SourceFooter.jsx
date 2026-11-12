import { BookOpen, ExternalLink, FileText, MessageSquare, Phone, Scale } from 'lucide-react';
import { CONTACTS, DATA_SOURCES } from '../../utils/disputePortal';

const SOURCE_ICONS = { 조정사례: FileText, 상담사례: MessageSquare, '판례·법령': Scale, 가이드: BookOpen };

// 첫 화면·자료 찾기 맨 아래 출처·연락처(생활법령정보 맨 아래 관련 기관 줄처럼). 링크는 기관 메인이 아니라 해당 자료 페이지로.
// 글 목록 대신 눌러 볼 수 있는 칸으로 둔다(레퍼런스 비교는 doc/근거조사 '출처·연락처' 참고).
// 연락처: GOV.UK 연락처 패턴·정부24 하단처럼 번호 + 운영시간·요금을 함께, 모바일에서 바로 걸리게 칸 전체가 tel 링크.
// 출처: Perplexity 출처 카드처럼 종류 + 자료 이름 + 무엇이 있는지 + [원문 보기].
export const SourceFooter = () => (
  <footer className="flex flex-col gap-5 rounded-card bg-surface-2 p-4 lg:p-5">
    <section aria-label="기관 연락처">
      <h3 className="text-label font-semibold text-ink-2">기관 연락처</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-3">
        {CONTACTS.map((contact) => (
          <li key={contact.name}>
            <a
              href={contact.href}
              aria-label={`${contact.name} ${contact.value} 전화 걸기`}
              className="flex h-full min-h-11 items-center gap-3 rounded-card border border-line bg-surface p-3 transition-colors hover:border-accent"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Phone size={16} />
              </span>
              <span className="min-w-0">
                <span className="block break-keep text-sub text-ink-2">{contact.name}</span>
                <span className="block font-num text-body font-semibold tabular-nums text-accent-strong">{contact.value}</span>
                {contact.note && <span className="block text-sub text-ink-3">{contact.note}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
    <section aria-label="자료 출처">
      <h3 className="text-label font-semibold text-ink-2">자료 출처</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {DATA_SOURCES.map((source) => {
          const Icon = SOURCE_ICONS[source.label] ?? FileText;
          return (
            <li key={source.detail}>
              <a
                href={source.href}
                target="_blank"
                rel="noreferrer"
                className="group flex h-full gap-3 rounded-card border border-line bg-surface p-3 transition-colors hover:border-accent"
              >
                <Icon size={18} className="mt-0.5 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="text-chip font-semibold text-ink-3">{source.label}</span>
                  <span className="block break-keep text-body font-semibold text-ink">{source.title}</span>
                  <span className="mt-0.5 block break-keep text-sub text-ink-3">{source.detail}</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-label font-semibold text-accent group-hover:text-accent-strong">
                    원문 보기
                    <ExternalLink size={14} />
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  </footer>
);
