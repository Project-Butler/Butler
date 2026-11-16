import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { useGetMarketPrices } from '../hooks/useGetMarketPrices';
import { getErrorMessage } from '../utils/getErrorMessage';
import { CommunityFrame } from '../components/CommunityLayout/CommunityFrame';
import { EmptyState } from '../components/CommunityLayout/EmptyState';
import { LoadingStatus } from '../components/CommunityLayout/LoadingStatus';
import { MarketSource } from '../components/CommunityMarket/MarketSource';
import { ChartLegend, PriceChart } from '../components/CommunityMarket/PriceChart';
import { Segment } from '../components/CommunitySegment/Segment';
import {
  AREA_BANDS,
  chartMonths,
  DEAL_TYPES,
  formatWon,
  getDealTypeLabel,
  monthlyValue,
  pickAreaBands,
  recentSummary,
} from '../utils/communityMarketSummary';

// 시세 화면.
// 데이터는 useGetMarketPrices(시세 API — 국토교통부 실거래가, 연동 규격 2장 모양). 거래 유형 · 면적대를 바꾸면 그 조합으로 다시 가져온다.
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

// 대표 숫자 카드: 최근 3개월 평균(지난달까지) + 증감률 + 무엇의 평균인지 한 줄 + 차트(지난달까지).
// 이번 달은 신고가 덜 들어와 빼고, 이번 달 거래는 오른쪽 "최근 거래" 표에만 보인다(utils/communityMarketSummary "이번 달 빼기").
// 매매는 디자인대로 전세 선과 전세 평균을 함께(전세 조회를 하나 더 한다), 전세 · 월세는 그 유형만.
const PriceCard = ({ prices, jeonse, dealType, band }) => {
  const summary = recentSummary({ prices, jeonse, dealType, band });
  const { rate } = summary;
  const months = chartMonths(prices.coveredFromYearMonth);
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

  return (
    <Card className="flex flex-col gap-1 p-6 lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-label font-semibold text-ink-2">{getDealTypeLabel(dealType)} 시세</span>
        {/* 계산에 쓴 마지막 달(지난달) */}
        <span className="font-num text-sub font-medium tabular-nums text-ink-3">{summary.endMonth}</span>
      </div>
      {summary.headline && <div className="font-num text-kpi font-bold tabular-nums leading-tight text-ink">{summary.headline}</div>}
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
        <span className="font-num text-sub leading-tight tabular-nums text-ink-3">{summary.caption}</span>
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
      {/* 도구 줄: 거래 유형 · 면적 칩 · 안내(넘치면 줄바꿈) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="w-56 flex-none">
          <Segment label="거래 유형" options={DEAL_TYPES} value={dealType} onChange={onDealTypeChange} />
        </div>
        <AreaChips owned={owned} value={bandKey} onChange={setBandKey} />
        {owned.size > 0 && <span className="text-sub text-ink-3">내 호실이 있는 면적대입니다</span>}
      </div>

      {prices.isPending && <LoadingStatus />}
      {prices.isError && <NoticeBox>{getErrorMessage(prices.error)}</NoticeBox>}
      {/* 아직 모으지 못한 시군구(처음 보는 단지). 정기 실행이 하루 한 번 채운다 — 빈 상태(거래 없음)와 다른 문구 */}
      {isCollecting && <EmptyState title="이 단지의 실거래를 모으는 중이에요" description="하루 안에 채워집니다. 그때 다시 열어 주세요." />}
      {isEmpty && <EmptyState title={`${band.label}에는 최근 ${getDealTypeLabel(dealType)} 거래가 없습니다.`} />}

      {data && !isCollecting && !isEmpty && (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <PriceCard prices={data} jeonse={dealType === 'SALE' ? jeonse.data : null} dealType={dealType} band={band} />
          <DealTable deals={data.recentDeals} dealType={dealType} />
        </div>
      )}

      {/* 출처 줄(활용신청서의 출처 표시). 모은 날(asOf)이 있을 때만 — 모으는 중에는 없다 */}
      {data?.source && data.asOf && <MarketSource source={data.source} asOf={data.asOf} />}
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
