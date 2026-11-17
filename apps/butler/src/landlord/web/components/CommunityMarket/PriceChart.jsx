// 시세 추이 차트(시세 화면 디자인 모양 — 가는 가로선 + 꺾은선 + 점 + 축 글자). 색은 토큰 클래스로.
// series: [{ label, strokeClass, fillClass, values }] — values 는 months 와 같은 길이, 거래 없는 달은 null.
// 거래가 있는 달에는 점, 이웃한 달끼리는 실선, 거래 없는 달을 건너 앞뒤 거래 달을 이을 때는 점선(빈 달에는 점을 찍지 않는다).
// 세로축: 눈금 2~3개(억 단위 — 월세 금액처럼 1억보다 작으면 만 단위)를 그래프 영역 바깥 왼쪽 여백에(선 · 점과 겹치지 않게).
// 가로축: 마지막 달에서 거꾸로 3개월마다.
// 세로 범위는 모든 선의 최소~최대에 위아래 여유를 둔다.
// width·height 는 viewBox 크기 — PC 는 넓게(640×240, 칸 폭에 맞춰 늘어남), 모바일을 다시 붙이면 모바일 디자인 크기(316×96)로.

const EOK = 100000000;
// 세로축 글자 자리(viewBox 단위) — "10.5억" · "300만" 이 들어가는 폭. 그래프 영역은 이 오른쪽부터
const AXIS_GUTTER = 44;
const AXIS_GAP = 6;
const MAN = 10000;

// 세로축 눈금 값: lo~hi 안에 2~3개가 들어가는 가장 촘촘한 "보기 좋은" 간격(1 · 2 · 2.5 · 3 · 4 · 5 × 10^k).
// 2~3개가 되는 간격이 없으면 3개 이하 중 가장 많은 것
export const axisTicks = (lo, hi) => {
  const span = hi - lo;
  if (!(span > 0)) return [];
  const power = 10 ** Math.floor(Math.log10(span / 3));
  let fallback = [];
  for (const step of [1, 2, 2.5, 3, 4, 5, 10, 20, 25, 30, 40, 50].map((multiple) => multiple * power)) {
    const ticks = [];
    for (let value = Math.ceil(lo / step) * step; value <= hi + step * 1e-9; value += step) ticks.push(Math.round(value));
    if (ticks.length >= 2 && ticks.length <= 3) return ticks;
    if (ticks.length <= 3 && ticks.length > fallback.length) fallback = ticks;
  }
  return fallback;
};
// 눈금 글자: "8억" · "10.5억" · "250만"
export const formatTick = (won) => (won >= EOK ? `${Number((won / EOK).toFixed(2))}억` : `${Math.round(won / MAN).toLocaleString('ko-KR')}만`);

// 가로축 글자: 마지막 달에서 거꾸로 3개월마다(간격이 일정하고 마지막 달이 늘 보이게)
const xLabelIndexes = (count) => {
  const indexes = [];
  for (let index = count - 1; index >= 0; index -= 3) indexes.unshift(index);
  return indexes;
};

export const PriceChart = ({ months, series, width = 640, height = 240 }) => {
  const edge = 4 * (width / 316);
  const left = AXIS_GUTTER;
  const right = width - edge;
  const top = height * 0.12;
  const bottom = height - height * 0.2;
  const step = (right - left) / Math.max(months.length - 1, 1);
  const all = series.flatMap((line) => line.values).filter((value) => value !== null);
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const pad = (max - min) * 0.15 || max * 0.05 || 1;
  const [lo, hi] = [min - pad, max + pad];
  const toX = (index) => left + index * step;
  const toY = (value) => bottom - ((value - lo) / (hi - lo)) * (bottom - top);
  const ticks = all.length ? axisTicks(lo, hi) : [];

  // 거래가 있는 달의 점들. 이웃한 달끼리 묶은 실선 조각들과, 조각 사이를 잇는 점선들
  const pointsOf = (values) => values.flatMap((value, index) => (value === null ? [] : [{ index, x: toX(index), y: toY(value) }]));
  const runsOf = (points) => {
    const runs = [];
    for (const point of points) {
      const run = runs.at(-1);
      if (run && point.index === run.at(-1).index + 1) run.push(point);
      else runs.push([point]);
    }
    return runs;
  };
  const first = series[0];
  const firstPoints = first ? pointsOf(first.values) : [];
  const last = firstPoints.at(-1);
  const labels = xLabelIndexes(months.length);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`최근 ${months.length}개월 ${series.map((line) => line.label).join('·')} 추이`} className="block h-auto w-full">
      {ticks.map((value) => (
        <line key={value} x1={left} y1={toY(value)} x2={right} y2={toY(value)} className="stroke-line" strokeWidth="1" />
      ))}
      {[...series].reverse().map((line, lineIndex) => {
        const points = pointsOf(line.values);
        const runs = runsOf(points);
        const strokeWidth = lineIndex === series.length - 1 ? 2 : 1.5;
        return (
          <g key={line.label} data-series={line.label}>
            {runs.slice(1).map((run, index) => {
              const from = runs[index].at(-1);
              const to = run[0];
              return (
                <line
                  key={`gap-${from.index}-${to.index}`}
                  data-segment="gap"
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className={line.strokeClass}
                  strokeWidth={strokeWidth}
                  strokeDasharray="4 4"
                  strokeLinecap="round"
                />
              );
            })}
            {runs
              .filter((run) => run.length > 1)
              .map((run) => (
                <polyline
                  key={`run-${run[0].index}`}
                  data-segment="solid"
                  fill="none"
                  className={line.strokeClass}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={run.map((point) => `${point.x},${point.y}`).join(' ')}
                />
              ))}
            {points.map((point) => (
              <circle key={`dot-${point.index}`} data-month={months[point.index]} cx={point.x} cy={point.y} r="2.5" className={line.fillClass} />
            ))}
          </g>
        );
      })}
      {last && <circle cx={last.x} cy={last.y} r="4" className={first.fillClass} />}
      {/* 세로축 글자는 그래프 영역 바깥 왼쪽 여백에, 가로선 높이에 맞춰 오른쪽 정렬 */}
      {ticks.map((value) => (
        <text key={value} data-tick="y" x={left - AXIS_GAP} y={toY(value) + 4} fontSize="11" textAnchor="end" className="fill-ink-3 font-num">
          {formatTick(value)}
        </text>
      ))}
      {labels.map((index, position) => (
        <text
          key={months[index]}
          data-tick="x"
          x={toX(index)}
          y={height - 4}
          fontSize="11"
          className="fill-ink-3 font-num"
          textAnchor={index === 0 ? 'start' : position === labels.length - 1 ? 'end' : 'middle'}
        >
          {months[index].slice(2)}
        </text>
      ))}
    </svg>
  );
};

export const ChartLegend = ({ colorClass, label }) => (
  <span className="inline-flex items-center gap-1.5 text-sub leading-tight text-ink-3">
    <i aria-hidden="true" className={`block h-[7px] w-[7px] rounded-full ${colorClass}`} />
    {label}
  </span>
);
