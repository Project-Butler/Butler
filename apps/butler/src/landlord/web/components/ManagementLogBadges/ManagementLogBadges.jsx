import { Badge } from '@butler/ui';
import { getLogOriginLabel, getLogScopeBadge, getLogTypeLabel, isFutureLog } from '../../utils/managementLog';

// 기록 한 건의 칩: 유형, 공개 범위, 예정(미래 날짜), 이전 소유자·자동 기록.
// wrap=false: 표 칸처럼 폭이 줄어드는 곳에서 칩을 한 줄로 둔다(목록 표).
export const ManagementLogBadges = ({ log, wrap = true }) => {
  const scope = getLogScopeBadge(log.scope);
  const origin = getLogOriginLabel(log);
  return (
    <span className={`flex items-center gap-1.5 ${wrap ? 'flex-wrap' : ''}`}>
      <Badge>{getLogTypeLabel(log.type)}</Badge>
      <Badge tone={scope.tone}>{scope.label}</Badge>
      {isFutureLog(log) && <Badge tone="warning">예정</Badge>}
      {origin && <Badge tone="pending">{origin}</Badge>}
    </span>
  );
};
