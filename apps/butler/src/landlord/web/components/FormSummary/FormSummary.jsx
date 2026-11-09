import { Check } from 'lucide-react';
import { IconTile } from '../IconTile/IconTile';

// 구역 폼 오른쪽 요약 패널: 입력한 항목에 체크, 아직이면 빈 원. 버튼은 두지 않는다(머리·폼 아래에 있다).
// rows: [{ label, value, done }], children: 아래쪽 안내(이전 계약 등)
export const FormSummary = ({ icon, title, rows, children }) => (
  <div className="form-summary overflow-hidden rounded-card border border-line bg-surface">
    <div className="flex items-center gap-3 border-b border-line p-5">
      <IconTile icon={icon} tone="accent" />
      <h2 className="text-section font-semibold text-ink">{title}</h2>
    </div>
    <ul className="space-y-3 p-5">
      {rows.map(({ label, value, done }) => (
        <li key={label} className="flex items-start gap-3">
          {done ? (
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-white" aria-label="입력함">
              <Check size={12} />
            </span>
          ) : (
            <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-line" aria-label="입력 전" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sub text-ink-3">{label}</p>
            <p className={`truncate text-body font-medium ${done ? 'text-ink' : 'text-ink-3'}`}>{value}</p>
          </div>
        </li>
      ))}
    </ul>
    {children && <div className="space-y-3 px-5 pb-5">{children}</div>}
  </div>
);
