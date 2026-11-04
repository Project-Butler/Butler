// 마감된 투표의 결과: 선택지마다 "N표 · P%" + 막대. 가장 많은 표는 진한 초록.
export const PollResults = ({ options }) => {
  const top = Math.max(...options.map((option) => option.voteCount));
  return (
    <ul aria-label="투표 결과" className="flex flex-col gap-3">
      {options.map((option) => {
        const isTop = top > 0 && option.voteCount === top;
        return (
          <li key={option.id} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3 text-body font-medium text-ink">
              <span>{option.label}</span>
              <span className={`font-num tabular-nums ${isTop ? 'font-semibold text-accent-strong' : 'text-ink-2'}`}>
                {option.voteCount}표 · {option.percent}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <i
                className={`block h-full rounded-full ${isTop ? 'bg-accent-strong' : 'bg-accent'}`}
                style={{ width: `${option.percent}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
};
