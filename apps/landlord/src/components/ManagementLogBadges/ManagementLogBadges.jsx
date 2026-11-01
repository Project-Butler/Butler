import { Badge } from '@butler/ui';
import { getLogOriginLabel, getLogScopeBadge, getLogTypeLabel, isFutureLog } from '../../utils/managementLog';

// 기록 한 건의 칩: 유형, 공개 범위, 예정(미래 날짜), 이전 소유자·자동 기록.
export const ManagementLogBadges = ({ log }) => {
  const scope = getLogScopeBadge(log.scope);
  const origin = getLogOriginLabel(log);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge>{getLogTypeLabel(log.type)}</Badge>
      <Badge tone={scope.tone}>{scope.label}</Badge>
      {isFutureLog(log) && <Badge tone="warning">예정</Badge>}
      {origin && <Badge tone="pending">{origin}</Badge>}
    </span>
  );
};
