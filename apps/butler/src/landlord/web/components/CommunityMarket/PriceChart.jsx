// 시세 추이 차트(시세 화면 디자인 모양 — 가는 가로선 3줄 + 꺾은선 + 점 + x축 달). 색은 토큰 클래스로.
// series: [{ label, strokeClass, fillClass, values }] — values 는 months 와 같은 길이, 거래 없는 달은 null.
// 거래가 있는 달에는 점, 이웃한 달끼리는 실선, 거래 없는 달을 건너 앞뒤 거래 달을 이을 때는 점선(빈 달에는 점을 찍지 않는다).
// 금액 축은 없다(디자인 그대로). 세로 범위는 모든 선의 최소~최대에 위아래 여유를 둔다.
// width·height 는 viewBox 크기 — PC 는 넓게(640×240, 칸 폭에 맞춰 늘어남), 모바일을 다시 붙이면 모바일 디자인 크기(316×96)로.

// x축 글자 다섯 개: 처음 · 마지막 달과 그 사이 고르게(달 수가 바뀌어도 마지막 달은 늘 보이고 글자가 붙지 않게)
const labelIndexes = (count) => [...new Set(Array.from({ length: Math.min(count, 5) }, (_value, index) => Math.round((index * (count - 1)) / Math.max(Math.min(count, 5) - 1, 1))))];

export const PriceChart = ({ months, series, width = 640, height = 240 }) => {
  const left = 4 * (width / 316);
  const top = height * 0.12;
  const bottom = height - height * 0.2;
  const step = (width - 2 * left) / Math.max(months.length - 1, 1);
  const all = series.flatMap((line) => line.values).filter((value) => value !== null);
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const pad = (max - min) * 0.15 || max * 0.05 || 1;
  const toX = (index) => left + index * step;
  const toY = (value) => bottom - ((value - (min - pad)) / (max - min + 2 * pad)) * (bottom - top);

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
  const labels = labelIndexes(months.length);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`최근 ${months.length}개월 ${series.map((line) => line.label).join('·')} 추이`} className="block h-auto w-full">
      {[0.25, 0.5, 0.75].map((ratio) => (
        <line
          key={ratio}
          x1={left}
          y1={top + (bottom - top) * ratio}
          x2={width - left}
          y2={top + (bottom - top) * ratio}
          className="stroke-line"
          strokeWidth="1"
        />
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
      {labels.map((index, position) => (
        <text
          key={months[index]}
          x={toX(index)}
          y={height - 4}
          fontSize="11"
          className="fill-ink-3 font-num"
          textAnchor={position === 0 ? 'start' : position === labels.length - 1 ? 'end' : 'middle'}
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
