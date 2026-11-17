// 시세 출처 줄 — "출처: 국토교통부 실거래가 · 기준 2026-11-17"(시세 계획서 7절, 활용신청서의 출처 표시). 시세 탭 · 브리핑이 같이 쓴다.
// asOf 는 그 시군구를 마지막으로 모은 날(한국 날짜)
export const MarketSource = ({ source, asOf, className = '' }) => (
  <p className={`text-sub leading-tight text-ink-3 ${className}`}>
    출처: {source} · 기준 <span className="font-num font-medium tabular-nums">{asOf}</span>
  </p>
);
