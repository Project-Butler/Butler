import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Card } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { useGetMarketPrices } from '../hooks/useGetMarketPrices';
import { getErrorMessage } from '../utils/getErrorMessage';
import { CommunityFrame } from '../components/CommunityLayout/CommunityFrame';
import { EmptyState } from '../components/CommunityLayout/EmptyState';
import { LoadingStatus } from '../components/CommunityLayout/LoadingStatus';
import { ChartLegend, PriceChart } from '../components/CommunityMarket/PriceChart';
import { Segment } from '../components/CommunitySegment/Segment';
import {
  AREA_BANDS,
  changeRate,
  DEAL_TYPES,
  formatWon,
  getDealTypeLabel,
  monthlyValue,
  monthsEnding,
  pickAreaBands,
  recentAverage,
} from '../utils/communityMarketSummary';

// 시세 화면.
// 데이터는 useGetMarketPrices(연동 규격 모양 — 지금은 예시 스텁). 거래 유형 · 면적대를 바꾸면 그 조합으로 다시 가져온다.
// 거래 유형은 주소(?dealType=JEONSE|MONTHLY, 매매는 안 씀)에 두어 새로고침 · 건물 바꾸기에도 남고,
// 면적대는 건물마다 "내 호실 면적대"로 다시 시작한다(건물마다 내 면적대가 다르다).

// 한 거래의 금액 표기: 매매 가격 / 전세 보증금 / 월세 "보증금 1억 / 월 280만"
const formatDealAmount = (deal, dealType) => {
  if (dealType === 'SALE') return formatWon(deal.price);
  if (dealType === 'JEONSE') return formatWon(deal.deposit);
  return `보증금 ${formatWon(deal.deposit)} / 월 ${formatWon(deal.monthlyRent)}`;
};
const AMOUNT_HEADER = { SALE: '금액', JEONSE: '보증금', MONTHLY: '보증금 / 월세' };

const AreaChips = ({ owned, value, onChange }) => (
  <div role="radiogroup" aria-label="면적대" className="flex flex-wrap gap-2">
    {AREA_BANDS.map((band) => {
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

// 대표 숫자 카드: 최근 실거래 1건 + 증감률 + 최근 3개월 줄 + 차트.
// 매매는 디자인대로 전세 선과 "최근 3개월 · 전세" 를 함께(전세 조회를 하나 더 한다), 전세 · 월세는 그 유형만.
const PriceCard = ({ prices, jeonse, dealType }) => {
  const latest = prices.recentDeals[0];
  const rate = changeRate(prices.monthly, dealType);
  const months = monthsEnding(prices.asOf);
  const valuesOf = (data, type) =>
    months.map((month) => {
      const row = data.monthly.find((item) => item.yearMonth === month);
      return row ? monthlyValue(row, type) : null;
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

  let recentLine = null;
  if (dealType === 'SALE') {
    const average = jeonse && recentAverage(jeonse.monthly, jeonse.asOf, 'avgDeposit');
    if (average) recentLine = `최근 3개월 · 전세 ${formatWon(average)}`;
  } else {
    const average = recentAverage(prices.monthly, prices.asOf, dealType === 'JEONSE' ? 'avgDeposit' : 'avgMonthlyRent');
    if (average) recentLine = `최근 3개월 평균 · ${dealType === 'JEONSE' ? '' : '월 '}${formatWon(average)}`;
  }

  return (
    <Card className="flex flex-col gap-1 p-6 lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-label font-semibold text-ink-2">최근 실거래가 · {getDealTypeLabel(dealType)}</span>
        {latest && <span className="font-num text-sub font-medium tabular-nums text-ink-3">{latest.contractDate.slice(0, 7)}</span>}
      </div>
      {latest && <div className="font-num text-kpi font-bold tabular-nums leading-tight text-ink">{formatDealAmount(latest, dealType)}</div>}
      <div className="flex items-baseline gap-2">
        {rate !== null && (
          // 소수 첫째 자리에서 0 이면 부호 · 색 없이 "0.0%"
          <span
            className={`font-num text-body font-medium tabular-nums ${
              Math.abs(rate) < 0.05 ? 'text-ink-3' : rate > 0 ? 'text-ok' : 'text-crit'
            }`}
          >
            {rate >= 0.05 ? '+' : ''}
            {Math.abs(rate) < 0.05 ? '0.0' : rate.toFixed(1)}%
          </span>
        )}
        {recentLine && <span className="font-num text-sub leading-tight tabular-nums text-ink-3">{recentLine}</span>}
      </div>
      <div className="mt-4">
        <PriceChart months={months} series={series} />
      </div>
      <div className="mt-1 flex items-center gap-3.5">
        {series.map((line) => (
          <ChartLegend key={line.label} colorClass={line.dotClass} label={line.label} />
        ))}
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

// 건물마다 새로 시작하도록 key={complexId} 로 그린다(면적대 선택이 건물을 따라가지 않게).
const MarketBody = ({ building, dealType, onDealTypeChange }) => {
  // 내 호실 면적은 my-buildings 응답의 unitAreas(인증 호실 · 면적 있는 것만). 비면 점 없이 60–85㎡ 로 시작한다.
  const { owned, defaultKey } = pickAreaBands(building.unitAreas ?? []);
  const [bandKey, setBandKey] = useState(defaultKey);
  const band = AREA_BANDS.find((item) => item.key === bandKey);
  const query = { complexId: building.complexId, areaMin: band.areaMin, areaMax: band.areaMax };
  const prices = useGetMarketPrices({ ...query, dealType });
  // 매매 화면의 전세 선 · "최근 3개월 · 전세" 용. 전세 · 월세 화면에서는 부르지 않는다.
  const jeonse = useGetMarketPrices({ ...query, dealType: 'JEONSE', enabled: dealType === 'SALE' });

  const data = prices.data;
  const isCollecting = data?.collectionStatus === 'COLLECTING';
  const isEmpty = Boolean(data) && !isCollecting && data.recentDeals.length === 0 && data.monthly.length === 0;

  return (
    <>
      {/* 도구 줄: 거래 유형 · 면적 칩 · 안내 · 예시 배지(넘치면 줄바꿈) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="w-56 flex-none">
          <Segment label="거래 유형" options={DEAL_TYPES} value={dealType} onChange={onDealTypeChange} />
        </div>
        <AreaChips owned={owned} value={bandKey} onChange={setBandKey} />
        {owned.size > 0 && <span className="text-sub text-ink-3">내 호실이 있는 면적대입니다</span>}
        {/* 시세 예시 데이터라는 표시(예시 숫자가 실제 시세처럼 보이지 않게). 플랫폼 시세 API 로 바꾸면 이 배지도 지운다. */}
        <Badge tone="warning" className="ml-auto">
          예시 데이터 · 시세 연동 전
        </Badge>
      </div>

      {prices.isPending && <LoadingStatus />}
      {prices.isError && <NoticeBox>{getErrorMessage(prices.error)}</NoticeBox>}
      {/* 아직 수집 안 된 단지. 작업 조회 API 가 없어 다시 묻지 않는다(임시) */}
      {isCollecting && <EmptyState title="시세를 모으는 중입니다" />}
      {isEmpty && <EmptyState title={`${band.label}에는 최근 ${getDealTypeLabel(dealType)} 거래가 없습니다.`} />}

      {data && !isCollecting && !isEmpty && (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <PriceCard prices={data} jeonse={dealType === 'SALE' ? jeonse.data : null} dealType={dealType} />
          <DealTable deals={data.recentDeals} dealType={dealType} />
        </div>
      )}

      {/* 출처 줄은 응답에 출처가 있을 때만(예시 데이터에는 없다) */}
      {data?.source && (
        <p className="text-sub leading-tight text-ink-3">
          출처: {data.source} · <span className="font-num font-medium tabular-nums">{data.asOf}</span> 기준
        </p>
      )}
    </>
  );
};

export const CommunityMarketPage = ({ frame, building }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const dealType = DEAL_TYPES.some((type) => type.value === searchParams.get('dealType')) ? searchParams.get('dealType') : 'SALE';
  const setDealType = (value) =>
    setSearchParams(value === 'SALE' ? new URLSearchParams() : new URLSearchParams({ dealType: value }), { replace: true });

  return (
    <CommunityFrame frame={frame} section="market" scopeText={`${building.name} 기준`}>
      <MarketBody key={building.complexId} building={building} dealType={dealType} onDealTypeChange={setDealType} />
    </CommunityFrame>
  );
};
