import { Badge, Button } from '@butler/ui';
import { NoticeBox } from '../../../web/components/NoticeBox/NoticeBox';
import { formatDday, getDdayTone } from '../../../web/utils/contract';
import {
  getRenewalNoticeKindLabel,
  getRenewalNoticeMethodLabel,
  getRenewalNoticePhaseBadge,
  getRenewalNoticeTimingBadge,
  getRenewalNoticeWarning,
  RENEWAL_NOTICE_LEGAL_NOTES,
} from '../../utils/scheduleView';

const Row = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0">
    <dt className="shrink-0 text-m-label text-ink-3">{label}</dt>
    <dd className="min-w-0 text-right text-body text-ink">{children}</dd>
  </div>
);

// 계약 상세의 갱신 거절 통지 카드(#163). summary 는 계약 응답의 renewalNotice(소유자·진행 중 계약에만 값이 있다).
// 통지 기간(만료 6개월~2개월 전) · 권장 마감 · 남은 날 · 최근 기록 · 경고 · 법 안내, [통지 기록]은 기록 시트를 연다.
export const RenewalNoticeCard = ({ summary, onOpenRecords }) => {
  const phase = getRenewalNoticePhaseBadge(summary);
  const warning = getRenewalNoticeWarning(summary);
  const latest = summary.latestNotice;
  const showDday = summary.phase !== 'CLOSED' && !summary.hasDeliveredInTime;

  return (
    <section aria-label="갱신 거절 통지" className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 pb-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-m-card font-semibold text-ink">갱신 거절 통지</h2>
        <Badge mobile tone={phase.tone}>
          {phase.label}
        </Badge>
      </div>
      <dl>
        <Row label="통지 기간">
          <span className="font-num tabular-nums">
            {summary.windowStart} ~ {summary.deadline}
          </span>
        </Row>
        <Row label="권장 마감">
          <span className="flex items-center justify-end gap-2">
            <span className="font-num tabular-nums">{summary.safeDeadline}까지 도달</span>
            {showDday && (
              <Badge tone={getDdayTone(summary.daysUntilDeadline)} className="rounded-chip font-num tabular-nums">
                {formatDday(summary.daysUntilDeadline)}
              </Badge>
            )}
          </span>
        </Row>
        <Row label="최근 기록">
          {latest ? (
            <span className="flex flex-col items-end gap-1">
              <span>
                {getRenewalNoticeKindLabel(latest.kind)} · {getRenewalNoticeMethodLabel(latest.method)}
              </span>
              <span className="font-num text-m-sub tabular-nums text-ink-3">
                보냄 {latest.sentOn} · 도달 {latest.deliveredOn ?? '미확인'}
              </span>
              <Badge mobile tone={getRenewalNoticeTimingBadge(latest.timing).tone}>
                {getRenewalNoticeTimingBadge(latest.timing).label}
              </Badge>
            </span>
          ) : (
            <span className="text-ink-3">없음</span>
          )}
        </Row>
      </dl>
      {warning && <NoticeBox tone={warning.tone}>{warning.text}</NoticeBox>}
      <ul className="flex list-disc flex-col gap-1 pl-4 text-m-sub text-ink-3">
        {RENEWAL_NOTICE_LEGAL_NOTES.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <Button variant="secondary" size="h48" onClick={onOpenRecords}>
        통지 기록
      </Button>
    </section>
  );
};
