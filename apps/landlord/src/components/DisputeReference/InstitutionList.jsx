import { ExternalLink } from 'lucide-react';

// 상담·조정 기관 목록. 이름과 연락처만 한 줄씩 두고, 누르면 기관 누리집을 새 창으로 연다.
export const InstitutionList = ({ institutions }) => (
  <ul className="divide-y divide-line rounded-card border border-line bg-surface">
    {institutions.map((item) => (
      <li key={item.key}>
        <a
          href={item.href}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 lg:px-5"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-body font-semibold text-ink">{item.name}</span>
            <span className="block text-sub text-ink-3">
              {item.role} · <span className="font-num tabular-nums">{item.contact}</span>
            </span>
          </span>
          <ExternalLink size={16} className="shrink-0 text-ink-3" />
        </a>
      </li>
    ))}
  </ul>
);
