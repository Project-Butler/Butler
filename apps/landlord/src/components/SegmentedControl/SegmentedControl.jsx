// 둘~여럿 중 하나 고르기(라디오 묶음). 호실 상세 '종료 사유'와 같은 모양.
// options: [{ value, label }]
export const SegmentedControl = ({ label, options, value, onChange, disabled = false }) => (
  <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-btn border border-line bg-surface-2 p-1">
    {options.map((option) => {
      const isSelected = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={isSelected}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`h-10 flex-1 rounded-input text-body transition-colors disabled:cursor-not-allowed ${
            isSelected ? 'bg-ink font-semibold text-white' : 'font-medium text-ink-2 hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
