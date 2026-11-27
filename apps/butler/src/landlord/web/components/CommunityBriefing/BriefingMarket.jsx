import { useGetMarketPrices } from '../../hooks/useGetMarketPrices';
import { hasNoPartialDeals, partialCoverage, partialMarketEmptyText } from '../../utils/communityMarketCollecting';
import { chartMonths, chartSeries, recentSummary } from '../../utils/communityMarketSummary';
import { MarketSource } from '../CommunityMarket/MarketSource';
import { PartialBasis } from '../CommunityMarket/PartialBasis';
import { hasMissingMonths, MissingLegend, PriceChart } from '../CommunityMarket/PriceChart';
import { BriefingCollectingNote } from './BriefingCollectingNote';
import { BRIEFING_ERROR_TEXT, BRIEFING_LOADING_TEXT, BriefingNote } from './BriefingNote';
import { BriefingSection } from './BriefingSection';

// 브리핑 — 시세: 내 호실 면적대 · 매매 기준 대표 숫자(최근 3개월 평균, 지난달까지) + 증감률 + 무엇의 평균인지 한 줄 + 작은 차트(매매 선 하나).
// 계산 규칙은 시세 탭과 같다(utils/communityMarketSummary recentSummary — 이번 달 빼기). 브리핑은 전세를 따로 부르지 않아 매매 평균만.
// 전환 칩은 두지 않는다(시세 탭에서). 데이터는 시세 탭과 같은 훅(국토교통부 실거래가 — 출처 줄도 같이).
// band: AREA_BANDS 한 칸(내 호실 면적대) · onMore: 시세 탭으로
// 빈 상태 문구(면적대마다) — 앱 브리핑 시세 카드도 같은 문구
export const briefingMarketEmptyText = (band) => `${band.label}에는 최근 매매 거래가 없습니다`;

// 데이터 · 계산(대표 숫자 · 차트 값) — 앱 브리핑 시세 카드도 같은 것을 쓴다.
// state: 'COLLECTING'(하나도 못 모음 — 안내) · 'EMPTY'(거래 없음) · 'DATA'(다 모았거나 일부 모음 — 대표 숫자 · 차트). 일부 모음이면 partial 이 있다(#267 2차)
export const useBriefingMarket = ({ building, band }) => {
  const prices = useGetMarketPrices({ complexId: building.complexId, dealType: 'SALE', areaMin: band.areaMin, areaMax: band.areaMax });
  const data = prices.data;
  const partial = data ? partialCoverage(data) : null;
  const summary = data ? recentSummary({ prices: data, dealType: 'SALE', band }) : null;
  // 하나도 못 모은 단지(COLLECTING)는 asOf 가 없다 — 그때는 차트를 그리지 않는다. 일부 모음이면 못 모은 달은 비운다(missing)
  const months = data?.asOf ? chartMonths(data.coveredFromYearMonth) : [];
  const { values, missing } = data?.asOf ? chartSeries(data, months, 'SALE') : { values: [], missing: [] };
  let state = null;
  if (data) {
    if (data.collectionStatus === 'COLLECTING' && !partial) state = 'COLLECTING';
    else if (partial ? hasNoPartialDeals(data) : data.recentDeals.length === 0 && data.monthly.length === 0) state = 'EMPTY';
    else state = 'DATA';
  }
  // 빈 상태 문구 — 일부 모음이면 본 범위를 밝힌다("모은 8개월 동안 60–85㎡ 매매 거래가 없습니다")
  const emptyText = partial ? partialMarketEmptyText(partial, band.label, '매매') : briefingMarketEmptyText(band);
  return { prices, data, partial, state, emptyText, summary, months, values, missing };
};

export const BriefingMarket = ({ building, band, onMore, className = '' }) => {
  const { prices, data, state, emptyText, summary, months, values, missing } = useBriefingMarket({ building, band });
  const series = [{ label: '매매', strokeClass: 'stroke-accent', fillClass: 'fill-accent', dotClass: 'bg-accent', values, missing }];

  let body;
  if (prices.isPending) body = <BriefingNote>{BRIEFING_LOADING_TEXT}</BriefingNote>;
  else if (prices.isError) body = <BriefingNote tone="error">{BRIEFING_ERROR_TEXT}</BriefingNote>;
  // 하나도 못 모았으면 안내(시도 전 한 줄 / 받기 실패 두 줄) — 최근 거래 칸도 같은 안내(BriefingCollectingNote)
  else if (state === 'COLLECTING') body = <BriefingCollectingNote prices={data} />;
  else if (state === 'EMPTY') body = <BriefingNote>{emptyText}</BriefingNote>;
  else {
    // 다 모았거나 일부 모음 — 일부 모음이면 큰 숫자 · 증감은 조건이 맞을 때만(recentSummary), 차트는 못 모은 달을 비우고, 맨 아래 "N개월 기준"
    body = (
      <div className="space-y-1 px-5 py-4">
        {summary.headline && <div className="font-num text-kpi font-bold tabular-nums leading-tight text-ink">{summary.headline}</div>}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {summary.changeText && <span className="font-num text-body font-medium tabular-nums text-ink-2">{summary.changeText}</span>}
          <span className="font-num text-sub leading-tight tabular-nums text-ink-3">{summary.caption}</span>
        </div>
        <div className="pt-2">
          <PriceChart months={months} height={160} series={series} />
        </div>
        {hasMissingMonths(series) && <MissingLegend />}
        {data.asOf && <MarketSource source={data.source} asOf={data.asOf} className="pt-1" />}
        <PartialBasis prices={data} />
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
