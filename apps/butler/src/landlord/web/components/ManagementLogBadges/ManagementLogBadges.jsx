import { Badge } from '@butler/ui';
import { Lock } from 'lucide-react';
import { getLogOriginLabel, getLogScopeBadge, getLogTypeLabel, isFutureLog, SCOPE_LABEL } from '../../utils/managementLog';

// 나만 보기 기록 표시(자물쇠 + "나만 보기"). 기준은 scope === 'PRIVATE'(H-29).
export const PrivateChip = () => (
  <Badge className="inline-flex items-center gap-1 whitespace-nowrap">
    <Lock size={12} aria-hidden="true" />
    {SCOPE_LABEL.PRIVATE}
  </Badge>
);

// 기록 한 건의 칩: 유형, 공개 범위(나만 보기는 자물쇠), 예정(미래 날짜), 이전 소유자·자동 기록.
// wrap=false: 표 칸처럼 폭이 줄어드는 곳에서 칩을 한 줄로 둔다(목록 표).
export const ManagementLogBadges = ({ log, wrap = true }) => {
  const scope = getLogScopeBadge(log.scope);
  const origin = getLogOriginLabel(log);
  return (
    <span className={`flex items-center gap-1.5 ${wrap ? 'flex-wrap' : ''}`}>
      <Badge>{getLogTypeLabel(log.type)}</Badge>
      {log.scope === 'PRIVATE' ? <PrivateChip /> : <Badge tone={scope.tone}>{scope.label}</Badge>}
      {isFutureLog(log) && <Badge tone="warning">예정</Badge>}
      {origin && <Badge tone="pending">{origin}</Badge>}
    </span>
  );
};
