import { useGetMarketPrices } from '../../hooks/useGetMarketPrices';
import { COLLECTING_BRIEFING_TEXT, collectingNotice } from '../../utils/communityMarketCollecting';
import { chartMonths, chartValue, recentSummary } from '../../utils/communityMarketSummary';
import { CollectingDescription } from '../CommunityMarket/CollectingDescription';
import { MarketSource } from '../CommunityMarket/MarketSource';
import { PriceChart } from '../CommunityMarket/PriceChart';
import { BRIEFING_ERROR_TEXT, BRIEFING_LOADING_TEXT, BriefingNote } from './BriefingNote';
import { BriefingSection } from './BriefingSection';

// 브리핑 — 시세: 내 호실 면적대 · 매매 기준 대표 숫자(최근 3개월 평균, 지난달까지) + 증감률 + 무엇의 평균인지 한 줄 + 작은 차트(매매 선 하나).
// 계산 규칙은 시세 탭과 같다(utils/communityMarketSummary recentSummary — 이번 달 빼기). 브리핑은 전세를 따로 부르지 않아 매매 평균만.
// 전환 칩은 두지 않는다(시세 탭에서). 데이터는 시세 탭과 같은 훅(국토교통부 실거래가 — 출처 줄도 같이).
// band: AREA_BANDS 한 칸(내 호실 면적대) · onMore: 시세 탭으로
export const BriefingMarket = ({ building, band, onMore, className = '' }) => {
  const prices = useGetMarketPrices({ complexId: building.complexId, dealType: 'SALE', areaMin: band.areaMin, areaMax: band.areaMax });
  const data = prices.data;
  const summary = data ? recentSummary({ prices: data, dealType: 'SALE', band }) : null;
  // 아직 수집 안 된 단지(COLLECTING)는 asOf 가 없다 — 그때는 차트를 그리지 않는다
  const months = data?.asOf ? chartMonths(data.coveredFromYearMonth) : [];
  const values = months.map((month) => {
    const row = data.monthly.find((item) => item.yearMonth === month);
    return row ? chartValue(row, 'SALE') : null;
  });

  let body;
  if (prices.isPending) body = <BriefingNote>{BRIEFING_LOADING_TEXT}</BriefingNote>;
  else if (prices.isError) body = <BriefingNote tone="error">{BRIEFING_ERROR_TEXT}</BriefingNote>;
  else if (data.collectionStatus === 'COLLECTING') {
    // 처음 모으는 중이면 한 줄 그대로, 받기가 실패한 달이 있으면 두 줄(문구 · 이유는 utils/communityMarketCollecting — 시세 탭과 같은 판단)
    const notice = collectingNotice(data);
    body = notice.failed ? (
      <BriefingNote>
        <span className="block">{notice.title}</span>
        <span className="block">
          <CollectingDescription notice={notice} />
        </span>
      </BriefingNote>
    ) : (
      <BriefingNote>{COLLECTING_BRIEFING_TEXT}</BriefingNote>
    );
  }
  else if (data.recentDeals.length === 0 && data.monthly.length === 0) body = <BriefingNote>{band.label}에는 최근 매매 거래가 없습니다</BriefingNote>;
  else {
    body = (
      <div className="space-y-1 px-5 py-4">
        {summary.headline && <div className="font-num text-kpi font-bold tabular-nums leading-tight text-ink">{summary.headline}</div>}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {summary.changeText && <span className="font-num text-body font-medium tabular-nums text-ink-2">{summary.changeText}</span>}
          <span className="font-num text-sub leading-tight tabular-nums text-ink-3">{summary.caption}</span>
        </div>
        <div className="pt-2">
          <PriceChart
            months={months}
            height={160}
            series={[{ label: '매매', strokeClass: 'stroke-accent', fillClass: 'fill-accent', dotClass: 'bg-accent', values }]}
          />
        </div>
        {data.asOf && <MarketSource source={data.source} asOf={data.asOf} className="pt-1" />}
      </div>
    );
  }

  return (
    <BriefingSection
      title="시세"
      scope={`${building.name} · 매매 · ${band.label}`}
      onMore={onMore}
      className={className}
    >
      {body}
    </BriefingSection>
  );
};
