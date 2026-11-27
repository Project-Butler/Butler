import { useGetMarketPrices } from '../../hooks/useGetMarketPrices';
import { formatWon } from '../../utils/communityMarketSummary';
import { BriefingCollectingNote } from './BriefingCollectingNote';
import { BRIEFING_ERROR_TEXT, BRIEFING_LOADING_TEXT, BriefingNote } from './BriefingNote';
import { BriefingSection } from './BriefingSection';

const MAX_DEALS = 5;
export const BRIEFING_DEALS_EMPTY_TEXT = '최근 거래가 없습니다';

// 데이터 · 계산 — 앱 브리핑 카드(app CommunityAppBriefingPage)도 같은 것을 쓴다(같은 요청 · 같은 5건)
export const useBriefingDeals = ({ building, band }) => {
  const prices = useGetMarketPrices({ complexId: building.complexId, dealType: 'SALE', areaMin: band.areaMin, areaMax: band.areaMax });
  const deals = prices.data?.recentDeals.slice(0, MAX_DEALS) ?? [];
  return { prices, deals };
};

// 브리핑 — 최근 거래: 시세 섹션과 같은 기준(내 면적대 · 매매)의 거래 최대 5건. 한 줄 = 날짜 · 전용 · 층 | 금액.
// 같은 훅 · 같은 키라 시세 섹션과 요청을 한 번만 한다.
// 시세를 아직 모으는 중(COLLECTING)이면 서버가 거래를 비워 준다 — "최근 거래가 없습니다" 가 아니라 시세 칸과 같은 안내(BriefingCollectingNote).
// "최근 거래가 없습니다" 는 다 모았는데(READY) 그 면적대 거래가 0건일 때만
export const BriefingDeals = ({ building, band, onMore, className = '' }) => {
  const { prices, deals } = useBriefingDeals({ building, band });

  let body;
  if (prices.isPending) body = <BriefingNote>{BRIEFING_LOADING_TEXT}</BriefingNote>;
  else if (prices.isError) body = <BriefingNote tone="error">{BRIEFING_ERROR_TEXT}</BriefingNote>;
  else if (prices.data.collectionStatus === 'COLLECTING') body = <BriefingCollectingNote prices={prices.data} />;
  else if (deals.length === 0) body = <BriefingNote>{BRIEFING_DEALS_EMPTY_TEXT}</BriefingNote>;
  else {
    body = (
      <ul>
        {deals.map((deal) => (
          <li
            key={`${deal.contractDate}-${deal.floor}-${deal.exclusiveArea}`}
            className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-b-0"
          >
            <span className="font-num text-sub tabular-nums text-ink-2">
              {deal.contractDate.slice(5)} · {Math.floor(deal.exclusiveArea)}㎡ · {deal.floor}층
            </span>
            <span className="whitespace-nowrap font-num text-body font-medium tabular-nums text-ink">{formatWon(deal.price)}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <BriefingSection title="최근 거래" scope={`매매 · ${band.label}`} onMore={onMore} className={className}>
      {body}
    </BriefingSection>
  );
};
