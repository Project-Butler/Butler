// 세그먼트 선택 (design.md §5). 선택은 Ink 배경 + 흰 글자, 비선택은 투명 + Ink 2.
// options: [{ value, label, count? }] — count는 탭 옆 숫자(숫자 글꼴). 칸이 많아 좁으면 가로로 밀어 본다.
export const SegmentedControl = ({ options, value, onChange, ariaLabel, className = '' }) => (
  <div
    role="group"
    aria-label={ariaLabel}
    className={`flex overflow-x-auto rounded-btn border border-line bg-surface-2 p-1 ${className}`}
  >
    {options.map((option) => {
      const isSelected = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={isSelected}
          onClick={() => onChange(option.value)}
          className={`flex min-h-10 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-input px-2 text-body lg:px-3 transition-colors ${
            isSelected ? 'bg-ink font-semibold text-white' : 'font-medium text-ink-2 hover:text-ink'
          }`}
        >
          {option.label}
          {option.count !== undefined && <span className="font-num tabular-nums">{option.count}</span>}
        </button>
      );
    })}
  </div>
);
