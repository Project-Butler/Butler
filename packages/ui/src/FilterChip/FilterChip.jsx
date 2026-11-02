// 필터 칩. 누르면 켜지고 다시 누르면 꺼진다. 켜진 칩은 Accent(초록 = 선택, design.md §1).
export const FilterChip = ({ children, selected = false, onClick }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={`min-h-11 rounded-full border px-3.5 text-label font-medium transition-colors lg:min-h-9 ${
      selected ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-surface text-ink-2 hover:bg-surface-2'
    }`}
  >
    {children}
  </button>
);
