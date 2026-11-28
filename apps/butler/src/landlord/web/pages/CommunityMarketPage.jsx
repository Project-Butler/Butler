import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { useGetMarketPrices } from '../hooks/useGetMarketPrices';
import { getErrorMessage } from '../utils/getErrorMessage';
import { CommunityFrame } from '../components/CommunityLayout/CommunityFrame';
import { EmptyState } from '../components/CommunityLayout/EmptyState';
import { LoadingStatus } from '../components/CommunityLayout/LoadingStatus';
import { CollectingDescription } from '../components/CommunityMarket/CollectingDescription';
import { MarketSource } from '../components/CommunityMarket/MarketSource';
import { PartialBasis } from '../components/CommunityMarket/PartialBasis';
import { ChartLegend, MissingLegend, PriceChart } from '../components/CommunityMarket/PriceChart';
import { Segment } from '../components/CommunitySegment/Segment';
import {
  areaBandsOf,
  chartMonths,
  chartSeries,
  DEAL_TYPES,
  formatWon,
  getDealTypeLabel,
  recentSummary,
  resolveAreaBand,
  singleAreaBandText,
} from '../utils/communityMarketSummary';
import { collectingNotice, hasNoPartialDeals, partialCoverage, partialMarketEmptyText } from '../utils/communityMarketCollecting';

// 시세 화면.
// 데이터는 useGetMarketPrices(시세 API — 국토교통부 실거래가, 연동 규격 2장 모양). 거래 유형 · 면적대를 바꾸면 그 조합으로 다시 가져온다.
// 거래 유형은 주소(?dealType=JEONSE|MONTHLY, 매매는 안 씀)에 두어 새로고침 · 건물 바꾸기에도 남고,
// 면적대는 건물마다 기본 선택으로 다시 시작한다(건물마다 보이는 칩 · 내 면적대가 다르다 — 규칙은 utils/communityMarketSummary "면적대 칩").

// 한 거래의 금액 표기: 매매 가격 / 전세 보증금 / 월세 "보증금 1억 / 월 280만"
export const formatDealAmount = (deal, dealType) => {
  if (dealType === 'SALE') return formatWon(deal.price);
  if (dealType === 'JEONSE') return formatWon(deal.deposit);
  return `보증금 ${formatWon(deal.deposit)} / 월 ${formatWon(deal.monthlyRent)}`;
};
export const AMOUNT_HEADER = { SALE: '금액', JEONSE: '보증금', MONTHLY: '보증금 / 월세' };

const AreaChipGroup = ({ bands, owned, value, onChange }) => (
  <div role="radiogroup" aria-label="면적대" className="flex flex-wrap gap-2">
    {bands.map((band) => {
      const isActive = band.key === value;
      return (
        <button
          key={band.key}
          type="button"
          role="radio"
          aria-checked={isActive}
          onClick={() => onChange(band.key)}
          className={`flex h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-chip font-semibold ${
            isActive ? 'bg-accent-soft text-accent-strong' : 'bg-surface-2 text-ink-3 hover:text-ink'
          }`}
        >
          {owned.has(band.key) && (
            <i aria-label="내 호실" className={`block h-1 w-1 rounded-full ${isActive ? 'bg-accent-strong' : 'bg-accent'}`} />
          )}
          {band.label}
        </button>
      );
    })}
  </div>
);

// 면적대 칩 — 그 단지가 가진 면적대만(bands). 하나만 남으면 칩 대신 글자("전용 60㎡ 이하") — utils/communityMarketSummary "면적대 칩"
const AreaChips = ({ bands, owned, value, onChange }) =>
  bands.length === 1 ? (
    <span className="flex h-8 flex-none items-center whitespace-nowrap text-chip font-semibold text-ink-2">{singleAreaBandText(bands[0])}</span>
  ) : (
    <AreaChipGroup bands={bands} owned={owned} value={value} onChange={onChange} />
  );

// 대표 숫자 카드: 최근 3개월 평균(지난달까지) + 증감률 + 무엇의 평균인지 한 줄 + 차트(지난달까지).
// 이번 달은 신고가 덜 들어와 빼고, 이번 달 거래는 오른쪽 "최근 거래" 표에만 보인다(utils/communityMarketSummary "이번 달 빼기").
// 매매는 디자인대로 전세 선과 전세 평균을 함께(전세 조회를 하나 더 한다), 전세 · 월세는 그 유형만.
// 일부만 모았으면(#267 2차) 못 모은 달은 차트에서 비우고("수집 중" 띠 · 범례), 최근 3개월이 다 모이지 않았으면 큰 숫자 대신 "모으는 중"
export const priceSeries = ({ prices, jeonse, dealType, months }) => {
  const series = [
    {
      label: dealType === 'MONTHLY' ? '월세(월)' : getDealTypeLabel(dealType),
      strokeClass: 'stroke-accent',
      fillClass: 'fill-accent',
      dotClass: 'bg-accent',
      ...chartSeries(prices, months, dealType),
    },
  ];
  if (dealType === 'SALE' && jeonse?.monthly.length) {
    series.push({ label: '전세', strokeClass: 'stroke-ink-3', fillClass: 'fill-ink-3', dotClass: 'bg-ink-3', ...chartSeries(jeonse, months, 'JEONSE') });
  }
  return series;
};

const PriceCard = ({ prices, jeonse, dealType, band }) => {
  const summary = recentSummary({ prices, jeonse, dealType, band });
  const months = chartMonths(prices.coveredFromYearMonth);
  const series = priceSeries({ prices, jeonse, dealType, months });

  return (
    <Card className="flex flex-col gap-1 p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-label font-semibold text-ink-2">{getDealTypeLabel(dealType)} 시세</span>
        {/* 계산에 쓴 마지막 달(지난달) */}
        <span className="font-num text-sub font-medium tabular-nums text-ink-3">{summary.endMonth}</span>
      </div>
      {summary.headline && <div className="font-num text-kpi font-bold tabular-nums leading-tight text-ink">{summary.headline}</div>}
      <div className="flex items-baseline gap-2">
        {/* 증감은 색이 아니라 ▲▼ 와 비교 대상으로(utils/communityMarketSummary formatChange) */}
        {summary.changeText && <span className="font-num text-body font-medium tabular-nums text-ink-2">{summary.changeText}</span>}
        <span className="font-num text-sub leading-tight tabular-nums text-ink-3">{summary.caption}</span>
      </div>
      <div className="mt-4">
        <PriceChart months={months} series={series} />
      </div>
      <div className="mt-1 flex items-center gap-3.5">
        {series.map((line) => (
          <ChartLegend key={line.label} colorClass={line.dotClass} label={line.label} />
        ))}
        <MissingLegend series={series} />
      </div>
    </Card>
  );
};

const DealTable = ({ deals, dealType }) => (
  <Card className="overflow-hidden p-0">
    <div className="px-5 py-4">
      <h2 className="text-section font-semibold text-ink">최근 거래</h2>
    </div>
    <table className="w-full text-body">
      <thead>
        <tr className="border-y border-line bg-surface-2 text-left text-chip text-ink-3">
          <th className="px-4 py-2.5 font-medium">날짜 · 전용 · 층</th>
          <th className="px-4 py-2.5 text-right font-medium">{AMOUNT_HEADER[dealType]}</th>
        </tr>
      </thead>
      <tbody>
        {deals.map((deal) => (
          <tr key={`${deal.contractDate}-${deal.floor}-${deal.exclusiveArea}`} className="border-b border-line last:border-b-0">
            <td className="px-4 py-3">
              <span className="block font-num tabular-nums text-ink">{deal.contractDate}</span>
              <span className="block text-sub text-ink-3">
                전용 <span className="font-num tabular-nums">{Math.floor(deal.exclusiveArea)}</span>㎡ ·{' '}
                <span className="font-num tabular-nums">{deal.floor}</span>층
              </span>
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-right font-num font-medium tabular-nums text-ink">
              {dealType === 'MONTHLY' ? (
                <>
                  <span className="block">보증금 {formatWon(deal.deposit)}</span>
                  <span className="block">월 {formatWon(deal.monthlyRent)}</span>
                </>
              ) : (
                formatDealAmount(deal, dealType)
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </Card>
);

// 시세 화면의 데이터 · 면적대 선택 · 상태(모으는 중 · 빈 상태). 앱 시세(app CommunityAppMarketPage)도 같은 것을 쓴다.
export const useMarketBodyState = ({ building, dealType }) => {
  // 보이는 칩 · 기본 선택은 my-buildings 의 unitAreas(내 활성 호실 · 면적 있는 것만) + dealAreas(그 단지 실거래 면적)로 —
  // 규칙은 utils/communityMarketSummary "면적대 칩"(브리핑 · 앱과 같은 함수)
  const areaBands = areaBandsOf(building);
  const [chosenKey, setBandKey] = useState(areaBands.defaultKey);
  // 고른 칩이 보이는 칩에서 빠지면(건물 목록을 다시 받아 dealAreas 가 바뀜) 기본 선택으로
  const band = resolveAreaBand(areaBands, chosenKey);
  const bandKey = band.key;
  const { bands, owned } = areaBands;
  const query = { complexId: building.complexId, areaMin: band.areaMin, areaMax: band.areaMax };
  const prices = useGetMarketPrices({ ...query, dealType });
  // 매매 화면의 전세 선 · "최근 3개월 · 전세" 용. 전세 · 월세 화면에서는 부르지 않는다.
  const jeonse = useGetMarketPrices({ ...query, dealType: 'JEONSE', enabled: dealType === 'SALE' });

  const data = prices.data;
  const isCollecting = data?.collectionStatus === 'COLLECTING';
  // 일부만 모았으면(#267 2차) 안내 대신 모은 달의 데이터를 보인다 — 안내(collecting)는 모은 달 데이터가 없을 때만
  const partial = isCollecting ? partialCoverage(data) : null;
  const collecting = isCollecting && !partial ? collectingNotice(data) : null;
  // 빈 상태: 다 모았는데 거래 없음 / 일부 모음인데 모은 달에 거래 없음(범위를 밝힌 문구 — emptyTitle)
  const isEmpty = Boolean(data) && (partial ? hasNoPartialDeals(data) : !isCollecting && data.recentDeals.length === 0 && data.monthly.length === 0);
  const emptyTitle = partial
    ? `${partialMarketEmptyText(partial, band.label, getDealTypeLabel(dealType))}.`
    : `${band.label}에는 최근 ${getDealTypeLabel(dealType)} 거래가 없습니다.`;
  const showData = Boolean(data) && (!isCollecting || Boolean(partial)) && !isEmpty;
  return { bands, owned, bandKey, setBandKey, band, prices, jeonse, data, isCollecting, collecting, partial, isEmpty, emptyTitle, showData };
};

// 거래 유형(?dealType=JEONSE|MONTHLY, 매매는 안 씀) — 앱 시세도 같은 주소 규칙
export const useMarketDealType = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const dealType = DEAL_TYPES.some((type) => type.value === searchParams.get('dealType')) ? searchParams.get('dealType') : 'SALE';
  const setDealType = (value) =>
    setSearchParams(value === 'SALE' ? new URLSearchParams() : new URLSearchParams({ dealType: value }), { replace: true });
  return [dealType, setDealType];
};

// 건물마다 새로 시작하도록 key={complexId} 로 그린다(면적대 선택이 건물을 따라가지 않게).
const MarketBody = ({ building, dealType, onDealTypeChange }) => {
  const { bands, owned, bandKey, setBandKey, band, prices, jeonse, data, collecting, isEmpty, emptyTitle, showData } = useMarketBodyState({ building, dealType });
  // 출처 줄 + (일부만 모았으면) "최근 13개월 중 8개월 기준 · 나머지는 매일 새벽 채워요" — 감싸지 않고 차트 카드의 형제로(출처 줄이 카드 바로 다음)
  const source =
    data?.source && data.asOf ? (
      <>
        <MarketSource source={data.source} asOf={data.asOf} />
        <PartialBasis prices={data} />
      </>
    ) : null;

  return (
    <>
      {/* 도구 줄: 거래 유형 · 면적 칩(그 단지가 가진 면적대만, 하나면 글자) · 안내(넘치면 줄바꿈) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="w-56 flex-none">
          <Segment label="거래 유형" options={DEAL_TYPES} value={dealType} onChange={onDealTypeChange} />
        </div>
        <AreaChips bands={bands} owned={owned} value={bandKey} onChange={setBandKey} />
        {owned.size > 0 && <span className="text-sub text-ink-3">내 호실이 있는 면적대입니다</span>}
      </div>

      {prices.isPending && <LoadingStatus />}
      {prices.isError && <NoticeBox>{getErrorMessage(prices.error)}</NoticeBox>}
      {/* 아직 모으지 못한 시군구(처음 보는 단지). 정기 실행이 하루 한 번 채운다 — 빈 상태(거래 없음)와 다른 문구.
          일부 모음이면 "모으는 중 · 최근 13개월 중 n개월을 모았어요 · 매일 새벽 이어서", 하나도 못 모았는데 받기가 실패한 달이 있으면
          "아직 못 불러옴 · 매일 새벽 다시 시도 · 마지막 시도 날짜"(문구 · 이유는 utils/communityMarketCollecting) */}
      {collecting && <EmptyState title={collecting.title} description={<CollectingDescription notice={collecting} />} />}
      {/* 다 모았는데 거래 없음 / 일부 모음인데 모은 달에 거래 없음(범위를 밝힌 문구) */}
      {isEmpty && <EmptyState title={emptyTitle} />}
      {/* 출처 줄(활용신청서의 출처 표시). 모은 날(asOf)이 있을 때만 — 하나도 못 모았으면 없다. 차트 카드 바로 아래(스크롤 없이 보이게) */}
      {isEmpty && source}

      {/* 다 모았거나(READY) 일부만 모았을 때(#267 2차 — 모은 달의 데이터, 틀릴 수 있는 숫자는 utils/communityMarketSummary 가 막는다) */}
      {showData && (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <div className="space-y-2 lg:col-span-2">
            <PriceCard prices={data} jeonse={dealType === 'SALE' ? jeonse.data : null} dealType={dealType} band={band} />
            {source}
          </div>
          <DealTable deals={data.recentDeals} dealType={dealType} />
        </div>
      )}
    </>
  );
};

export const CommunityMarketPage = ({ frame, building }) => {
  const [dealType, setDealType] = useMarketDealType();

  return (
    <CommunityFrame frame={frame} section="market" scopeText={`${building.name} 기준`}>
      <MarketBody key={building.complexId} building={building} dealType={dealType} onDealTypeChange={setDealType} />
    </CommunityFrame>
  );
};
