import { CONTACTS, DATA_SOURCES } from '../../utils/disputePortal';

// 첫 화면·자료 찾기 맨 아래 출처·연락처(생활법령정보 맨 아래 관련 기관 줄처럼). 링크는 기관 메인이 아니라 해당 자료 페이지로.
export const SourceFooter = () => (
  <footer className="flex flex-col gap-4 rounded-card bg-surface-2 p-4 text-sub lg:p-5">
    <section aria-label="자료 출처">
      <h3 className="text-label font-semibold text-ink-2">자료 출처</h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {DATA_SOURCES.map((source) => (
          <li key={source.detail} className="flex gap-3">
            <span className="w-16 shrink-0 text-ink-3">{source.label}</span>
            <a href={source.href} target="_blank" rel="noreferrer" className="min-w-0 break-keep text-ink-2 underline hover:text-ink">
              {source.detail}
            </a>
          </li>
        ))}
      </ul>
    </section>
    <section aria-label="기관 연락처">
      <h3 className="text-label font-semibold text-ink-2">기관 연락처</h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {CONTACTS.map((contact) => (
          <li key={contact.name} className="flex flex-wrap gap-x-3">
            <span className="text-ink-2">{contact.name}</span>
            <a
              href={contact.href}
              target={contact.href.startsWith('http') ? '_blank' : undefined}
              rel="noreferrer"
              className="font-num font-semibold tabular-nums text-accent hover:text-accent-strong"
            >
              {contact.value}
            </a>
          </li>
        ))}
      </ul>
    </section>
  </footer>
);
