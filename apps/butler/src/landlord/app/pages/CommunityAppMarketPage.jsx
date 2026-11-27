import { BRIEFING_LOADING_TEXT } from '../../web/components/CommunityBriefing/BriefingNote';
import { AppCollectingDescription } from '../components/CommunityApp/AppCollectingDescription';
import { MarketSource } from '../../web/components/CommunityMarket/MarketSource';
import { ChartLegend, PriceChart } from '../../web/components/CommunityMarket/PriceChart';
import { AMOUNT_HEADER, useMarketBodyState, useMarketDealType } from '../../web/pages/CommunityMarketPage';
import { AREA_BANDS, chartMonths, chartValue, DEAL_TYPES, getDealTypeLabel, recentSummary } from '../../web/utils/communityMarketSummary';
import { getErrorMessage } from '../../web/utils/getErrorMessage';
import { AppCard, AppNote } from '../components/CommunityApp/AppCard';
import { AppChipGroup, AppSegment } from '../components/CommunityApp/AppControls';
import { AppDealRow } from '../components/CommunityApp/AppListRows';
import { CommunityAppFrame } from '../components/CommunityApp/CommunityAppFrame';

// 앱 시세 — PC 시세 화면(CommunityMarketPage)의 휴대폰 배치. 데이터 · 면적대 선택 · 상태(모으는 중 · 빈 상태) · 거래 유형 주소(?dealType=)는
// PC 와 같은 훅(useMarketBodyState · useMarketDealType), 숫자 · 문구는 같은 계산(utils/communityMarketSummary).
// PC 의 두 칸(차트 카드 | 최근 거래 표) → 한 줄씩: 대표 숫자 카드 → 출처 줄 → 최근 거래 목록. 표의 열 이름은 카드 둘째 줄에 같은 글자로.

const AREA_OPTIONS = AREA_BANDS.map((band) => ({ value: band.key, label: band.label }));

// 대표 숫자 카드: "{유형} 시세" · 계산에 쓴 마지막 달 / 큰 숫자 / 증감 · 설명 / 차트(매매면 전세 선도) / 범례 — PC PriceCard 와 같은 내용
const SummaryCard = ({ prices, jeonse, dealType, band }) => {
  const summary = recentSummary({ prices, jeonse, dealType, band });
  const months = chartMonths(prices.coveredFromYearMonth);
  const valuesOf = (data, type) =>
    months.map((month) => {
      const row = data.monthly.find((item) => item.yearMonth === month);
      return row ? chartValue(row, type) : null;
    });
  const series = [
    {
      label: dealType === 'MONTHLY' ? '월세(월)' : getDealTypeLabel(dealType),
      strokeClass: 'stroke-accent',
      fillClass: 'fill-accent',
      dotClass: 'bg-accent',
      values: valuesOf(prices, dealType),
    },
  ];
  if (dealType === 'SALE' && jeonse?.monthly.length) {
    series.push({ label: '전세', strokeClass: 'stroke-ink-3', fillClass: 'fill-ink-3', dotClass: 'bg-ink-3', values: valuesOf(jeonse, 'JEONSE') });
  }
  return (
    <section aria-label={`${getDealTypeLabel(dealType)} 시세`} className="space-y-1 rounded-card border border-line bg-surface px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-m-label font-semibold text-ink-2">{getDealTypeLabel(dealType)} 시세</span>
        <span className="font-num text-num-sub font-medium tabular-nums text-ink-3">{summary.endMonth}</span>
      </div>
      {summary.headline && <p className="font-num text-num-kpi font-bold tabular-nums text-ink">{summary.headline}</p>}
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {summary.changeText && <span className="font-num text-num-body font-medium tabular-nums text-ink-2">{summary.changeText}</span>}
        <span className="font-num text-m-sub tabular-nums text-ink-3">{summary.caption}</span>
      </p>
      <div className="pt-2">
        <PriceChart months={months} series={series} width={316} height={150} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
        {series.map((line) => (
          <ChartLegend key={line.label} colorClass={line.dotClass} label={line.label} />
        ))}
      </div>
    </section>
  );
};

const MarketBody = ({ building, dealType, onDealTypeChange }) => {
  const { owned, bandKey, setBandKey, band, prices, jeonse, data, isCollecting, collecting, isEmpty } = useMarketBodyState({ building, dealType });
  const source = data?.source && data.asOf ? <MarketSource source={data.source} asOf={data.asOf} /> : null;

  return (
    <>
      <div className="space-y-2">
        <AppSegment label="거래 유형" options={DEAL_TYPES} value={dealType} onChange={onDealTypeChange} />
        <AppChipGroup label="면적대" options={AREA_OPTIONS} value={bandKey} onChange={setBandKey} dotKeys={owned} />
        {owned.size > 0 && <p className="text-m-sub text-ink-3">내 호실이 있는 면적대입니다</p>}
      </div>

      {(prices.isPending || prices.isError || isCollecting || isEmpty) && (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          {prices.isPending && <AppNote>{BRIEFING_LOADING_TEXT}</AppNote>}
          {prices.isError && <AppNote tone="error">{getErrorMessage(prices.error)}</AppNote>}
          {/* 아직 다 모으지 못한 시군구 — 일부 모음 · 받기 실패 · 시도 전 셋 다 PC 와 같은 문구(utils/communityMarketCollecting) */}
          {collecting && (
            <AppNote>
              <span className="block font-semibold text-ink-2">{collecting.title}</span>
              <span className="block">
                <AppCollectingDescription notice={collecting} />
              </span>
            </AppNote>
          )}
          {isEmpty && <AppNote>{`${band.label}에는 최근 ${getDealTypeLabel(dealType)} 거래가 없습니다.`}</AppNote>}
        </div>
      )}
      {isEmpty && source}

      {data && !isCollecting && !isEmpty && (
        <>
          <div className="space-y-2">
            <SummaryCard prices={data} jeonse={dealType === 'SALE' ? jeonse.data : null} dealType={dealType} band={band} />
            {source}
          </div>
          <AppCard title="최근 거래" scope={`날짜 · 전용 · 층 / ${AMOUNT_HEADER[dealType]}`}>
            <ul aria-label="최근 거래">
              {data.recentDeals.map((deal) => (
                <AppDealRow key={`${deal.contractDate}-${deal.floor}-${deal.exclusiveArea}`} deal={deal} dealType={dealType} />
              ))}
            </ul>
          </AppCard>
        </>
      )}
    </>
  );
};

export const CommunityAppMarketPage = ({ frame, building }) => {
  const [dealType, setDealType] = useMarketDealType();
  return (
    <CommunityAppFrame frame={frame} section="market" scopeText={`${building.name} 기준`}>
      <MarketBody key={building.complexId} building={building} dealType={dealType} onDealTypeChange={setDealType} />
    </CommunityAppFrame>
  );
};
