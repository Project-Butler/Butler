import { COLLECT_FAILED_LAST_ATTEMPT_LABEL } from '../../utils/communityMarketCollecting';

// 시세 "모으는 중" 안내의 설명 줄 — 시세 탭 · 브리핑이 같이 쓴다. notice 는 utils/communityMarketCollecting collectingNotice 의 결과.
// 받기 실패면 "매일 새벽 다시 시도하고 있어요 · 마지막 시도 2026-11-25"(날짜는 숫자 글꼴, design.md 7절), 처음 모으는 중이면 설명 그대로
export const CollectingDescription = ({ notice }) => (
  <>
    {notice.description}
    {notice.lastAttemptDate && (
      <>
        {' '}· {COLLECT_FAILED_LAST_ATTEMPT_LABEL} <span className="font-num tabular-nums">{notice.lastAttemptDate}</span>
      </>
    )}
  </>
);
