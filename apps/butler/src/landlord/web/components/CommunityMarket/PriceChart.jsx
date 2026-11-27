// 시세 추이 차트(시세 화면 디자인 모양 — 가는 가로선 + 꺾은선 + 점 + 축 글자). 색은 토큰 클래스로.
// series: [{ label, strokeClass, fillClass, values, missing? }] — values 는 months 와 같은 길이, 거래 없는 달 · 못 모은 달은 null.
// missing(선택, 같은 길이)은 못 모은 달 true(일부 모음 — utils/communityMarketSummary chartSeries).
// 거래가 있는 달에는 점, 이웃한 달끼리는 실선, 거래 없는 달을 건너 앞뒤 거래 달을 이을 때는 점선(빈 달에는 점을 찍지 않는다).
// 못 모은 달은 선을 끊고 비운다 — 그 달을 건너는 점선도 긋지 않는다(거래 없는 달과 구분, #267 2차). 첫 줄(대표 유형)의 못 모은 달에는
// 옅은 배경 띠(surface-2)와 "매매 수집 중" 글자(series[0].missingLabel — 띠가 글자보다 좁으면 글자 없이, 범례 MissingLegend 가 알린다).
// 비교 선(둘째 줄부터)은 자기 missing 으로 끊기만 하고 띠를 따로 그리지 않는다 — 매매 띠 안을 지나는 전세 선은 모은 전세 데이터다.
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

// 띠 · 범례 글자 — 보통은 줄의 missingLabel("매매 수집 중", utils/communityMarketCollecting missingMonthsLabel), 없으면 이것
export const MISSING_LABEL = '수집 중';
const missingLabelOf = (series) => series[0]?.missingLabel ?? MISSING_LABEL;
// 글자가 들어가는 띠 폭(viewBox 단위) — 글자 11 × 글자 수 + 여백
const labelFits = (label, bandWidth) => bandWidth >= label.length * 11 + 6;
// 이어진 못 모은 달 묶음들 [{ start, end }](인덱스, 양끝 포함)
const missingGroupsOf = (missing = []) => {
  const groups = [];
  missing.forEach((isMissing, index) => {
    if (!isMissing) return;
    const group = groups.at(-1);
    if (group && group.end === index - 1) group.end = index;
    else groups.push({ start: index, end: index });
  });
  return groups;
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
  // 못 모은 달 묶음(첫 줄 기준) — 배경 띠는 그 달들의 가운데에서 반 칸씩 넓혀 그래프 영역 안으로
  const missingGroups = missingGroupsOf(first?.missing);
  const missingCount = missingGroups.reduce((sum, group) => sum + group.end - group.start + 1, 0);
  const bandOf = ({ start, end }) => {
    const x1 = Math.max(left, toX(start) - step / 2);
    const x2 = Math.min(right, toX(end) + step / 2);
    return { x: x1, width: Math.max(x2 - x1, 1) };
  };
  const missingLabel = missingLabelOf(series);
  const ariaLabel = `최근 ${months.length}개월 ${series.map((line) => line.label).join('·')} 추이${missingCount ? ` · ${missingLabel} ${missingCount}개월` : ''}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="block h-auto w-full">
      {missingGroups.map((group) => {
        const band = bandOf(group);
        return (
          <g key={`missing-${group.start}`} data-missing-band={`${months[group.start]}~${months[group.end]}`}>
            <rect x={band.x} y={top * 0.5} width={band.width} height={bottom - top * 0.5} className="fill-surface-2" />
            {labelFits(missingLabel, band.width) && (
              <text data-missing-label x={band.x + band.width / 2} y={top * 0.5 + 13} fontSize="11" textAnchor="middle" className="fill-ink-3">
                {missingLabel}
              </text>
            )}
          </g>
        );
      })}
      {ticks.map((value) => (
        <line key={value} x1={left} y1={toY(value)} x2={right} y2={toY(value)} className="stroke-line" strokeWidth="1" />
      ))}
      {[...series].reverse().map((line, lineIndex) => {
        const points = pointsOf(line.values);
        const runs = runsOf(points);
        const strokeWidth = lineIndex === series.length - 1 ? 2 : 1.5;
        // 두 거래 달 사이에 못 모은 달이 있으면 점선으로 잇지 않는다(선을 끊는다)
        const crossesMissing = (from, to) => (line.missing ?? []).some((isMissing, index) => isMissing && index > from.index && index < to.index);
        return (
          <g key={line.label} data-series={line.label}>
            {runs.slice(1).map((run, index) => {
              const from = runs[index].at(-1);
              const to = run[0];
              if (crossesMissing(from, to)) return null;
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

// 시리즈 목록에서 범례 "수집 중" 을 그릴지(첫 줄 = 주 선 기준 — 띠와 같은 기준, 비교 선의 못 모은 달은 띠 · 범례 없이 끊기만)
export const hasMissingMonths = (series) => Boolean(series[0]?.missing?.some(Boolean));
// 범례의 "매매 수집 중"(못 모은 달의 배경 띠와 같은 색) — 주 선에 못 모은 달이 있을 때만 그린다(없으면 아무것도 그리지 않는다)
export const MissingLegend = ({ series }) =>
  hasMissingMonths(series) ? (
    <span className="inline-flex items-center gap-1.5 text-sub leading-tight text-ink-3">
      <i aria-hidden="true" className="block h-[9px] w-[12px] rounded-[2px] border border-line bg-surface-2" />
      {missingLabelOf(series)}
    </span>
  ) : null;
