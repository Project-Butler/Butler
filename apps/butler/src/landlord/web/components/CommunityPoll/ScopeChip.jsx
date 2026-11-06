// 투표 범위 칩(투표 목록 · 상세).

// 범위 칩: "우리 단지"(accent) / 법정동 이름(회색). 사각(rounded-chip).
export const ScopeChip = ({ scope, dongName, size = 'sm' }) => (
  <span
    className={`inline-flex flex-none items-center whitespace-nowrap rounded-chip px-2 text-chip font-semibold ${
      size === 'sm' ? 'h-[22px]' : 'h-6'
    } ${scope === 'COMPLEX' ? 'bg-accent-soft text-accent-strong' : 'bg-surface-2 text-ink-3'}`}
  >
    {scope === 'COMPLEX' ? '우리 단지' : dongName}
  </span>
);
