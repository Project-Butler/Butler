// 시세 추이 차트(시세 화면 디자인 모양 — 가는 가로선 3줄 + 꺾은선 + 마지막 점 + x축 달 5개). 색은 토큰 클래스로.
// series: [{ label, strokeClass, values }] — values 는 months 와 같은 길이, 거래 없는 달은 null(선이 끊긴다).
// 금액 축은 없다(디자인 그대로). 세로 범위는 모든 선의 최소~최대에 위아래 여유를 둔다.
// width·height 는 viewBox 크기 — PC 는 넓게(640×240, 칸 폭에 맞춰 늘어남), 모바일을 다시 붙이면 모바일 디자인 크기(316×96)로.
const LABEL_INDEXES = [0, 3, 6, 9, 11];

export const PriceChart = ({ months, series, width = 640, height = 240 }) => {
  const left = 4 * (width / 316);
  const top = height * 0.12;
  const bottom = height - height * 0.2;
  const step = (width - 2 * left) / (months.length - 1);
  const all = series.flatMap((line) => line.values).filter((value) => value !== null);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.15 || max * 0.05 || 1;
  const toX = (index) => left + index * step;
  const toY = (value) => bottom - ((value - (min - pad)) / (max - min + 2 * pad)) * (bottom - top);

  // null 에서 끊어 여러 조각의 꺾은선으로
  const segments = (values) => {
    const result = [];
    let current = [];
    values.forEach((value, index) => {
      if (value === null) {
        if (current.length) result.push(current);
        current = [];
      } else current.push(`${toX(index)},${toY(value)}`);
    });
    if (current.length) result.push(current);
    return result;
  };
  const first = series[0];
  const lastIndex = first.values.reduce((found, value, index) => (value === null ? found : index), -1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`최근 12개월 ${series.map((line) => line.label).join('·')} 추이`} className="block h-auto w-full">
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
      {[...series].reverse().map((line, lineIndex) =>
        segments(line.values).map((points) =>
          points.length === 1 ? (
            <circle key={`${line.label}-${points[0]}`} cx={points[0].split(',')[0]} cy={points[0].split(',')[1]} r="2" className={line.fillClass} />
          ) : (
            <polyline
              key={`${line.label}-${points[0]}`}
              fill="none"
              className={line.strokeClass}
              strokeWidth={lineIndex === series.length - 1 ? 2 : 1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points.join(' ')}
            />
          ),
        ),
      )}
      {lastIndex >= 0 && <circle cx={toX(lastIndex)} cy={toY(first.values[lastIndex])} r="3" className={first.fillClass} />}
      {LABEL_INDEXES.filter((index) => index < months.length).map((index, position, list) => (
        <text
          key={months[index]}
          x={toX(index)}
          y={height - 4}
          fontSize="11"
          className="fill-ink-3 font-num"
          textAnchor={position === 0 ? 'start' : position === list.length - 1 ? 'end' : 'middle'}
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
