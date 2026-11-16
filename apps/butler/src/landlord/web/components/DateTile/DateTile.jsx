// 날짜 타일(월 / 일). 관리 로그 타임라인·다가오는 일정에서 쓴다. date: 'YYYY-MM-DD'
export const DateTile = ({ date }) => {
  const [, month, day] = date.split('-');
  return (
    <span className="flex w-11 shrink-0 flex-col overflow-hidden rounded-input border border-line text-center" aria-hidden="true">
      <span className="bg-surface-2 py-0.5 text-chip font-semibold text-ink-3">{Number(month)}월</span>
      <span className="py-1 font-num text-card font-bold tabular-nums text-ink">{Number(day)}</span>
    </span>
  );
};
