import { ExternalLink } from 'lucide-react';

// '어디에 도움을 요청해야 하나요?' 기관 카드. 기관 이름보다 "이럴 때 여기로"를 먼저 보여 주고,
// 대상·신청·비용·기간을 표로 붙여 신청·안내로 바로 보낸다.
export const HelpRouteCard = ({ route }) => (
  <section className="flex h-full flex-col rounded-card border border-line bg-surface p-5">
    <p className="break-keep text-card font-semibold text-ink">{route.when}</p>
    <p className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-body font-semibold text-accent-strong">→ {route.name}</span>
      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-chip font-semibold text-accent-strong">{route.badge}</span>
    </p>
    <dl className="mt-4 flex flex-1 border-t border-line pt-3 flex-col gap-1.5 text-body">
      {route.facts.map(([term, value]) => (
        <div key={term} className="flex gap-3">
          <dt className="w-16 shrink-0 text-ink-3">{term}</dt>
          <dd className="min-w-0 break-keep text-ink">{value}</dd>
        </div>
      ))}
    </dl>
    {route.source && (
      <a href={route.source.href} target="_blank" rel="noreferrer" className="mt-2 self-start text-sub text-ink-3 underline hover:text-ink">
        출처 · {route.source.label}
      </a>
    )}
    <div className="mt-4 flex flex-wrap gap-2">
      {route.actions.map((action) => (
        <a
          key={action.label}
          href={action.href}
          target="_blank"
          rel="noreferrer"
          className={`flex min-h-11 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-btn px-4 text-label font-semibold transition-colors ${
            action.primary ? 'bg-accent text-surface hover:bg-accent-strong' : 'border border-line text-ink hover:bg-surface-2'
          }`}
        >
          {action.label}
          <ExternalLink size={14} />
        </a>
      ))}
    </div>
  </section>
);
