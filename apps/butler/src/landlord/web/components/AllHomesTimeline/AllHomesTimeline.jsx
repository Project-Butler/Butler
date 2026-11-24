import { Badge } from '@butler/ui';
import { DOT_COLOR_CLASS } from '../HouseLogTimeline/HouseLogTimeline';
import { computeTicks, isInAxis, toPercent } from '../../utils/houseLogTimeline';

const WINDOW_STYLE = {
  background: 'repeating-linear-gradient(135deg, rgb(var(--color-warn-soft)) 0 6px, rgb(var(--color-warn) / 0.28) 6px 12px)',
};
const shortDate = (date) => date.slice(2).replaceAll('-', '.');

// 한 호실 줄의 막대·통지 기간·점. 위치는 모두 같은 달력(axis) 기준이다.
const Lane = ({ row, axis, today }) => {
  const pct = (date) => toPercent(date, axis);
  const { bar, barEnd, current, endedOn } = row;
  const notice = current?.renewalNotice;
  const contractStarts = [row.current, row.next].filter((contract) => contract && isInAxis(contract.startDate, axis));
  return (
    <div className="relative mr-6 min-h-[76px]">
      {isInAxis(today, axis) && <span className="absolute inset-y-0 z-20 w-0.5 bg-ink" style={{ left: `${pct(today)}%` }} aria-hidden="true" />}
      <div className="absolute inset-x-0 top-1/2 -mt-1.5 h-3">
        {bar ? (
          <span
            className={`absolute inset-y-0 rounded-full ${endedOn ? 'bg-ink-3/35' : 'bg-accent-soft'}`}
            style={{ left: `${pct(bar.startDate)}%`, width: `${Math.max(0.5, pct(barEnd) - pct(bar.startDate))}%` }}
            data-testid="lane-bar"
          >
            {!endedOn && bar.startDate < today && (
              <span
                className="absolute inset-y-0 left-0 rounded-l-full bg-accent/35"
                style={{ width: `${Math.min(100, ((pct(today) - pct(bar.startDate)) / Math.max(0.01, pct(barEnd) - pct(bar.startDate))) * 100)}%` }}
              />
            )}
          </span>
        ) : (
          <span className="absolute inset-0 rounded-full bg-ink-3/20" data-testid="lane-empty" />
        )}
        {row.next && (
          <span
            className={`absolute inset-y-0 rounded-r-full border-2 border-l-0 border-dashed ${row.nextKind === 'RENEWAL' ? 'border-accent bg-ok-soft' : 'border-seal bg-seal-soft'}`}
            style={{ left: `${pct(row.next.startDate)}%`, width: `${pct(row.next.endDate) - pct(row.next.startDate)}%` }}
          />
        )}
        {notice && (
          <>
            <span
              className={`absolute -inset-y-[3px] rounded-md border-[1.5px] border-warn ${row.nextKind === 'RENEWAL' ? 'opacity-30' : ''}`}
              style={{ ...WINDOW_STYLE, left: `${pct(notice.windowStart)}%`, width: `${pct(notice.deadline) - pct(notice.windowStart)}%` }}
            />
            <span className={`absolute -inset-y-[7px] w-[3px] rounded-sm bg-crit ${row.nextKind === 'RENEWAL' ? 'opacity-30' : ''}`} style={{ left: `${pct(notice.deadline)}%` }} />
          </>
        )}
        {endedOn && <span className="absolute -inset-y-2 -ml-px w-[3px] bg-ink" style={{ left: `${pct(endedOn)}%` }} />}
        {row.logs
          .filter((log) => isInAxis(log.occurredOn, axis))
          .map((log) => (
            <span
              key={log.id}
              className={`absolute top-1/2 -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border-2 border-surface shadow-[0_0_0_1px_rgb(var(--color-ink-3)/0.45)] ${DOT_COLOR_CLASS[log.type] ?? 'bg-ink-3'}`}
              style={{ left: `${pct(log.occurredOn)}%` }}
              data-testid="lane-dot"
              aria-hidden="true"
            />
          ))}
        {/* 계약 점(파랑)은 거르기와 상관없이 늘 보인다(H-25). */}
        {contractStarts.map((contract) => (
          <span
            key={contract.id}
            className="absolute top-1/2 -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border-2 border-surface bg-seal shadow-[0_0_0_1px_rgb(var(--color-ink-3)/0.45)]"
            style={{ left: `${pct(contract.startDate)}%` }}
            data-testid="lane-contract-dot"
            aria-hidden="true"
          />
        ))}
      </div>
      {bar && (
        <>
          <span className="absolute top-2 whitespace-nowrap font-num text-chip text-ink-3" style={{ left: `${pct(bar.startDate)}%` }}>
            {shortDate(bar.startDate)} 시작
          </span>
          <span className="absolute bottom-2 z-30 -translate-x-full whitespace-nowrap rounded bg-surface px-1 font-num text-chip text-ink-3" style={{ left: `${pct(barEnd)}%` }}>
            {shortDate(barEnd)} {endedOn ? (row.isSold ? '매도' : '끝남') : row.current?.isEndingEarly ? '해지' : '만료'}
          </span>
        </>
      )}
    </div>
  );
};

// 전체 호실 계약 타임라인(U-17, H-28): 같은 달력 위에 호실마다 한 줄 + 오늘 세로선 하나.
// rows: utils buildHomeRows 결과(이미 통지 마감 가까운 순). summaryOf(row): { tone, badge, next } — utils getHomeRowSummary.
// 거르기가 있으면 이름 옆에 맞는 기록 수, 없는 호실은 흐리게 "맞는 기록 없음". 호실 이름을 누르면 그 호실로(onOpenHome).
export const AllHomesTimeline = ({ axis, rows, today, summaryOf, onOpenHome }) => {
  const todayPercent = toPercent(today, axis);
  // '오늘' 이름표와 겹치는 눈금은 뺀다.
  const ticks = computeTicks(axis, { edgeGap: 3 }).filter((tick) => Math.abs(tick.percent - todayPercent) > 6);
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface" aria-label="전체 호실 계약 타임라인">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-card-sm font-semibold text-ink">전체 호실 계약 타임라인</h2>
        <p className="text-sub text-ink-3">모든 호실이 같은 달력 위에 · 세로선 하나가 오늘 · 호실 이름을 누르면 그 호실로</p>
      </div>
      <div className="grid grid-cols-[300px_1fr] border-b border-line bg-surface-2">
        <div className="px-5 py-2 text-sub font-semibold text-ink-2">호실</div>
        <div className="relative mr-6 h-9">
          {ticks.map((tick) => (
            <span key={tick.date} className="absolute top-2.5 -translate-x-1/2 whitespace-nowrap font-num text-chip text-ink-3" style={{ left: `${tick.percent}%` }}>
              {tick.label}
            </span>
          ))}
          {isInAxis(today, axis) && (
            <span className="absolute top-1.5 z-10 -translate-x-1/2 rounded-md bg-ink px-2 text-chip font-bold text-surface" style={{ left: `${todayPercent}%` }}>
              오늘
            </span>
          )}
        </div>
      </div>
      {rows.length === 0 && <p className="py-10 text-center text-body text-ink-3">호실이 없어요</p>}
      {rows.map((row) => {
        const summary = summaryOf(row);
        const isCrit = summary.tone === 'danger';
        return (
          <div
            key={row.property.id}
            className={`grid grid-cols-[300px_1fr] border-b border-line last:border-b-0 ${row.isDimmed ? 'opacity-45' : ''}`}
            data-testid="home-lane"
          >
            <button type="button" onClick={() => onOpenHome(row.property.id)} className="block min-h-[76px] px-5 py-3 text-left hover:bg-surface-2">
              <span className="block text-card-sm font-semibold text-ink">
                {row.property.displayName}
                {row.matchCount !== null && (
                  <span className={`ml-1.5 font-num text-sub font-semibold ${row.isDimmed ? 'text-ink-3' : 'text-accent-strong'}`}>
                    {row.isDimmed ? '맞는 기록 없음' : `${row.matchCount}건`}
                  </span>
                )}
              </span>
              <span className="mt-1 flex items-center gap-2">
                <Badge tone={summary.tone} className={`font-num tabular-nums ${isCrit ? '!bg-crit !text-white' : ''}`}>
                  {summary.badge}
                </Badge>
                <span className={`truncate text-sub ${isCrit ? 'text-crit-ink' : 'text-ink-3'}`}>{summary.next}</span>
              </span>
            </button>
            <Lane row={row} axis={axis} today={today} />
          </div>
        );
      })}
    </section>
  );
};
