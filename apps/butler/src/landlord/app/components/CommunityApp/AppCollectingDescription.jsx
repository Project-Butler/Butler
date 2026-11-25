import { COLLECT_FAILED_LAST_ATTEMPT_LABEL } from '../../../web/utils/communityMarketCollecting';
import { DotLine } from './AppListRows';

// 시세 "모으는 중" 안내의 설명 줄 — 앱(브리핑 시세 카드 · 시세 탭). 문구는 웹 CollectingDescription 과 같다(같은 상수).
// 받기 실패면 "매일 새벽 다시 시도하고 있어요 · 마지막 시도 2026-11-25" — 좁은 폭에서 날짜가 "2026-" / "11-25" 로 끊기지 않게
// "마지막 시도 날짜" 를 한 덩어리로, 둘 사이 점은 DotLine 으로(줄이 바뀌면 점이 줄 끝에 매달리지 않는다)
export const AppCollectingDescription = ({ notice }) =>
  notice.lastAttemptDate ? (
    <DotLine>
      <span>{notice.description}</span>
      <span className="whitespace-nowrap">
        {COLLECT_FAILED_LAST_ATTEMPT_LABEL} <span className="font-num tabular-nums">{notice.lastAttemptDate}</span>
      </span>
    </DotLine>
  ) : (
    notice.description
  );
