import { Badge } from '@butler/ui';
import { useGetMarketPrices } from '../../hooks/useGetMarketPrices';
import { changeRate, formatWon, monthlyValue, monthsEnding } from '../../utils/communityMarketSummary';
import { PriceChart } from '../CommunityMarket/PriceChart';
import { BRIEFING_ERROR_TEXT, BRIEFING_LOADING_TEXT, BriefingNote } from './BriefingNote';
import { BriefingSection } from './BriefingSection';

// 브리핑 — 시세: 내 호실 면적대 · 매매 기준 대표 숫자(가장 최근 거래) + 증감률 + 작은 차트(매매 선 하나).
// 전환 칩은 두지 않는다(시세 탭에서). 데이터는 시세 탭과 같은 훅(지금은 예시 데이터 — 예시 배지도 같이).
// band: AREA_BANDS 한 칸(내 호실 면적대) · onMore: 시세 탭으로
export const BriefingMarket = ({ building, band, onMore, className = '' }) => {
  const prices = useGetMarketPrices({ complexId: building.complexId, dealType: 'SALE', areaMin: band.areaMin, areaMax: band.areaMax });
  const data = prices.data;
  const latest = data?.recentDeals[0];
  const rate = data ? changeRate(data.monthly, 'SALE') : null;
  const months = data ? monthsEnding(data.asOf) : [];
  const values = months.map((month) => {
    const row = data.monthly.find((item) => item.yearMonth === month);
    return row ? monthlyValue(row, 'SALE') : null;
  });

  let body;
  if (prices.isPending) body = <BriefingNote>{BRIEFING_LOADING_TEXT}</BriefingNote>;
  else if (prices.isError) body = <BriefingNote tone="error">{BRIEFING_ERROR_TEXT}</BriefingNote>;
  else if (data.collectionStatus === 'COLLECTING') body = <BriefingNote>시세를 모으는 중입니다</BriefingNote>;
  else if (!latest && data.monthly.length === 0) body = <BriefingNote>{band.label}에는 최근 매매 거래가 없습니다</BriefingNote>;
  else {
    body = (
      <div className="space-y-1 px-5 py-4">
        {latest && <div className="font-num text-kpi font-bold tabular-nums leading-tight text-ink">{formatWon(latest.price)}</div>}
        {rate !== null && (
          <span
            className={`font-num text-body font-medium tabular-nums ${
              Math.abs(rate) < 0.05 ? 'text-ink-3' : rate > 0 ? 'text-ok' : 'text-crit'
            }`}
          >
            {rate >= 0.05 ? '+' : ''}
            {Math.abs(rate) < 0.05 ? '0.0' : rate.toFixed(1)}%
          </span>
        )}
        <div className="pt-2">
          <PriceChart
            months={months}
            height={160}
            series={[{ label: '매매', strokeClass: 'stroke-accent', fillClass: 'fill-accent', dotClass: 'bg-accent', values }]}
          />
        </div>
      </div>
    );
  }

  return (
    <BriefingSection
      title="시세"
      scope={`${building.name} · 매매 · ${band.label}`}
      onMore={onMore}
      className={className}
      // 예시 숫자가 실제 시세처럼 보이지 않게(시세 탭과 같은 배지). 플랫폼 시세 API 로 바꾸면 함께 지운다.
      aside={<Badge tone="warning">예시 데이터</Badge>}
    >
      {body}
    </BriefingSection>
  );
};
