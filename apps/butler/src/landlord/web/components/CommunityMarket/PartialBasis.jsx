import { partialBasisParts, partialCoverage } from '../../utils/communityMarketCollecting';
import { CollectedMonthsText } from './CollectingDescription';

// 일부만 모았을 때(#267 2차) 카드 아래 작은 한 줄 — "최근 13개월 중 8개월 기준 · 나머지는 매일 새벽 채워요"(숫자는 숫자 글꼴).
// 보이는 숫자 · 차트 · 거래가 모은 달만으로 만든 것임을 밝힌다. READY · 하나도 못 모음이면 그리지 않는다(utils/communityMarketCollecting partialCoverage).
// 웹 시세 탭 · 웹 브리핑 · 앱 시세 · 앱 브리핑이 같이 쓴다. 좁은 폭에서는 낱말 단위로 줄을 바꾼다(break-keep)
export const PartialBasis = ({ prices, className = '' }) => {
  const coverage = partialCoverage(prices);
  if (!coverage) return null;
  return (
    <p data-partial-basis className={`break-keep text-sub leading-tight text-ink-3 ${className}`}>
      <CollectedMonthsText parts={partialBasisParts(coverage)} />
    </p>
  );
};
