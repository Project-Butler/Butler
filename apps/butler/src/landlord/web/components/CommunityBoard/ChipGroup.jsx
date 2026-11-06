// 하나만 고르는 알약 칩 줄(게시판 목록의 분류 칩 모양). 글쓰기 분류·신고 사유에도 같은 칩을 쓴다.
export const ChipGroup = ({ label, options, value, onChange, disabled = false, wrap = false }) => (
  <div role="radiogroup" aria-label={label} className={`flex min-w-0 gap-2 ${wrap ? 'flex-wrap' : 'overflow-x-auto [scrollbar-width:none]'}`}>
    {options.map((option) => {
      const isActive = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={isActive}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`flex h-8 flex-none items-center whitespace-nowrap rounded-full px-3 text-chip font-semibold disabled:cursor-not-allowed ${
            isActive ? 'bg-accent-soft text-accent-strong' : 'bg-surface-2 text-ink-3'
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
