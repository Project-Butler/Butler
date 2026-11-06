import { AlertCircle, ChevronRight } from 'lucide-react';

// '최근 임대차 이슈'. 기사 요약 대신 임대인에게 미치는 영향을 먼저 쓰고,
// 내 계약에 해당하는지 확인(AI) · 관련 판례 · 상황 안내로 바로 잇는다.
export const IssueCard = ({ issue, onCheckMine, onSearch, onOpenTopic }) => (
  <section className="rounded-card border border-line bg-surface p-5 lg:p-6">
    <p className="flex items-center gap-1.5 text-label font-semibold text-accent-strong">
      <AlertCircle size={16} />
      최근 임대차 이슈
    </p>
    <h3 className="mt-3 break-keep text-section font-semibold text-ink">{issue.title}</h3>
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {issue.chips.map((chip) => (
        <li key={chip} className="rounded-chip bg-surface-2 px-2.5 py-1 text-chip font-semibold text-ink-2">
          {chip}
        </li>
      ))}
    </ul>
    <div className="mt-4 rounded-input bg-warn-soft px-4 py-3">
      <p className="text-label font-semibold text-warn-ink">내가 임대인이라면</p>
      <p className="mt-1 break-keep text-body text-ink">{issue.impact}</p>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onCheckMine}
        className="flex min-h-11 items-center gap-1 rounded-btn bg-accent px-4 text-label font-semibold text-surface transition-colors hover:bg-accent-strong"
      >
        내 계약에 해당하는지 확인
        <ChevronRight size={16} />
      </button>
      <button
        type="button"
        onClick={onSearch}
        className="flex min-h-11 items-center gap-1 rounded-btn border border-line px-4 text-label font-semibold text-ink transition-colors hover:bg-surface-2"
      >
        관련 판례
        <ChevronRight size={16} />
      </button>
      <button
        type="button"
        onClick={onOpenTopic}
        className="flex min-h-11 items-center gap-1 rounded-btn border border-line px-4 text-label font-semibold text-ink transition-colors hover:bg-surface-2"
      >
        갱신·종료 가이드
        <ChevronRight size={16} />
      </button>
      <a href={issue.source.href} target="_blank" rel="noreferrer" className="ml-auto text-sub text-ink-3 hover:text-ink">
        {issue.source.press} · <span className="font-num tabular-nums">{issue.source.date}</span>
      </a>
    </div>
  </section>
);
