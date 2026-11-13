// 밑줄형 탭 (Figma M06 상세 탭). 선택 탭은 굵은 글씨 + 초록 밑줄. 칸이 넘치면 가로로 민다.
// options: [{ value, label }]. 탭 내용은 쓰는 쪽이 value 로 골라 그린다(id: `${idPrefix}-panel`).
export const UnderlineTabs = ({ options, value, onChange, ariaLabel, idPrefix }) => (
  <div role="tablist" aria-label={ariaLabel} className="flex overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {options.map((option) => {
      const selected = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${option.value}`}
          aria-selected={selected}
          aria-controls={`${idPrefix}-panel`}
          onClick={() => onChange(option.value)}
          className={`-mb-px min-h-11 flex-1 shrink-0 whitespace-nowrap border-b-2 px-3 text-body transition-colors ${
            selected ? 'border-accent font-semibold text-ink' : 'border-transparent font-medium text-ink-3'
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
