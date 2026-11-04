// 두세 칸 중 하나를 고르는 세그먼트(시세 거래 유형 · 투표 진행중/마감).
// 고른 칸은 흰 바탕 + 테두리.
export const Segment = ({ label, options, value, onChange }) => (
  <div role="radiogroup" aria-label={label} className="flex rounded-btn border border-line bg-surface-2 p-1">
    {options.map((option) => {
      const isActive = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={isActive}
          onClick={() => onChange(option.value)}
          className={`flex h-8 flex-1 items-center justify-center rounded-[9px] text-label font-semibold ${
            isActive ? 'border border-line bg-surface text-ink' : 'text-ink-3'
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
