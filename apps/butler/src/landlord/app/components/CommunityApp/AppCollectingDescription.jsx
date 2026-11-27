import { CollectedMonthsText } from '../../../web/components/CommunityMarket/CollectingDescription';
import { COLLECT_FAILED_LAST_ATTEMPT_LABEL } from '../../../web/utils/communityMarketCollecting';
import { DotLine } from './AppListRows';

// 시세 "모으는 중" 안내의 설명 줄 — 앱(브리핑 시세 카드 · 시세 탭). 문구는 웹 CollectingDescription 과 같다(같은 상수).
// 덩어리 사이 점은 DotLine 으로(좁은 폭에서 줄이 바뀌면 점이 줄 끝에 매달리지 않는다):
//   일부 모음 "최근 13개월 중 8개월을 모았어요" · "매일 새벽 이어서 모아요"(뒤 덩어리는 짧아 한 덩어리로 — "이어서" / "모아요" 로 끊기지 않게)
//   받기 실패 "매일 새벽 다시 시도하고 있어요" · "마지막 시도 2026-11-25"(날짜가 "2026-" / "11-25" 로 끊기지 않게 한 덩어리로)
export const AppCollectingDescription = ({ notice }) => {
  if (notice.progressParts) {
    return (
      <DotLine>
        <span>
          <CollectedMonthsText parts={notice.progressParts} />
        </span>
        <span className="whitespace-nowrap">{notice.description}</span>
      </DotLine>
    );
  }
  return notice.lastAttemptDate ? (
    <DotLine>
      <span>{notice.description}</span>
      <span className="whitespace-nowrap">
        {COLLECT_FAILED_LAST_ATTEMPT_LABEL} <span className="font-num tabular-nums">{notice.lastAttemptDate}</span>
      </span>
    </DotLine>
  ) : (
    notice.description
  );
};
