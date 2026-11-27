import { Fragment } from 'react';
import { COLLECT_FAILED_LAST_ATTEMPT_LABEL } from '../../utils/communityMarketCollecting';

// 문구 조각(utils/communityMarketCollecting collectedMonthsParts) — 숫자 조각만 숫자 글꼴로(design.md 숫자 글꼴). 앱 설명 줄도 쓴다
export const CollectedMonthsText = ({ parts }) =>
  parts.map((part, index) => <Fragment key={index}>{typeof part === 'number' ? <span className="font-num tabular-nums">{part}</span> : part}</Fragment>);

// 시세 "모으는 중" 안내의 설명 줄 — 시세 탭 · 브리핑이 같이 쓴다. notice 는 utils/communityMarketCollecting collectingNotice 의 결과.
// 일부 모음이면 "최근 13개월 중 8개월을 모았어요 · 매일 새벽 이어서 모아요"(숫자는 숫자 글꼴),
// 받기 실패면 "매일 새벽 다시 시도하고 있어요 · 마지막 시도 2026-11-25"(날짜는 숫자 글꼴, design.md 7절), 아직 시도 전이면 설명 그대로
export const CollectingDescription = ({ notice }) => (
  <>
    {notice.progressParts && (
      <>
        <CollectedMonthsText parts={notice.progressParts} /> ·{' '}
      </>
    )}
    {notice.description}
    {notice.lastAttemptDate && (
      <>
        {' '}· {COLLECT_FAILED_LAST_ATTEMPT_LABEL} <span className="font-num tabular-nums">{notice.lastAttemptDate}</span>
      </>
    )}
  </>
);
