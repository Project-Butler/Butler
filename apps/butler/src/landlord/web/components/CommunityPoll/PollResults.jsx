// 마감된 투표의 결과(표 수 기준, 11/05 "보유 수로"): 위에 "참여 n명 · 총 m표", 선택지마다 "m표 · P%" + 막대.
// 가장 많은 표는 진한 초록. 내가 고른 선택지에 "내 선택 · N표".
export const PollResults = ({ options, voteCount, weightTotal, myOptionId = null, myWeight = 0 }) => {
  const top = Math.max(...options.map((option) => option.weightTotal));
  const num = (value) => <span className="font-num font-medium tabular-nums">{value}</span>;
  return (
    <div className="space-y-3">
      <p className="text-sub text-ink-2">
        참여 {num(voteCount)}명 · 총 {num(weightTotal)}표
      </p>
      <ul aria-label="투표 결과" className="flex flex-col gap-3">
        {options.map((option) => {
          const isTop = top > 0 && option.weightTotal === top;
          const isMine = option.id === myOptionId;
          return (
            <li key={option.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3 text-body font-medium text-ink">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="break-words">{option.label}</span>
                  {isMine && (
                    <span className="flex-none rounded-chip bg-accent-soft px-2 py-0.5 text-chip font-semibold text-accent-strong">
                      내 선택 · <span className="font-num tabular-nums">{myWeight}</span>표
                    </span>
                  )}
                </span>
                <span className={`flex-none font-num tabular-nums ${isTop ? 'font-semibold text-accent-strong' : 'text-ink-2'}`}>
                  {option.weightTotal}표 · {option.percent}%
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
    </div>
  );
};
