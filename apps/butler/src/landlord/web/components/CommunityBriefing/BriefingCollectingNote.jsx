import { COLLECTING_BRIEFING_TEXT, collectingNotice } from '../../utils/communityMarketCollecting';
import { CollectingDescription } from '../CommunityMarket/CollectingDescription';
import { BriefingNote } from './BriefingNote';

// 브리핑 — 시세를 아직 모으는 중(collectionStatus COLLECTING)일 때 시세 칸 · 최근 거래 칸이 같이 쓰는 안내.
// 서버는 COLLECTING 이면 monthly · recentDeals 를 비워 준다 — 거래가 없는 게 아니라 아직 보여 주지 않는 것이라,
// 최근 거래 칸도 "최근 거래가 없습니다" 대신 시세 칸과 같은 안내를 쓴다(#267). 문구 · 판단은 utils/communityMarketCollecting:
// 아직 시도 전이면 한 줄, 일부 모음 · 받기 실패면 제목 · 설명 두 줄. prices = 시세 응답(useGetMarketPrices 의 data)
export const BriefingCollectingNote = ({ prices }) => {
  const notice = collectingNotice(prices);
  if (notice.kind === 'FIRST') return <BriefingNote>{COLLECTING_BRIEFING_TEXT}</BriefingNote>;
  return (
    <BriefingNote>
      <span className="block">{notice.title}</span>
      <span className="block">
        <CollectingDescription notice={notice} />
      </span>
    </BriefingNote>
  );
};
