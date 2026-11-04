import { useGetMarketPrices } from '../../hooks/useGetMarketPrices';
import { formatWon } from '../../utils/communityMarketSummary';
import { BRIEFING_ERROR_TEXT, BRIEFING_LOADING_TEXT, BriefingNote } from './BriefingNote';
import { BriefingSection } from './BriefingSection';

const MAX_DEALS = 5;

// 브리핑 — 최근 거래: 시세 섹션과 같은 기준(내 면적대 · 매매)의 거래 최대 5건. 한 줄 = 날짜 · 전용 · 층 | 금액.
// 같은 훅 · 같은 키라 시세 섹션과 요청을 한 번만 한다.
export const BriefingDeals = ({ building, band, onMore, className = '' }) => {
  const prices = useGetMarketPrices({ complexId: building.complexId, dealType: 'SALE', areaMin: band.areaMin, areaMax: band.areaMax });
  const deals = prices.data?.recentDeals.slice(0, MAX_DEALS) ?? [];

  let body;
  if (prices.isPending) body = <BriefingNote>{BRIEFING_LOADING_TEXT}</BriefingNote>;
  else if (prices.isError) body = <BriefingNote tone="error">{BRIEFING_ERROR_TEXT}</BriefingNote>;
  else if (deals.length === 0) body = <BriefingNote>최근 거래가 없습니다</BriefingNote>;
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
