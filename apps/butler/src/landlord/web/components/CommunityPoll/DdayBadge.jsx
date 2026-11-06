import { Badge } from '@butler/ui';
import { daysUntilKst, formatDday } from '../../utils/communityFormat';
import { DefaultBadge } from './DefaultBadge';

// 마감까지 D-day. 3일 이내는 빨강, 그 밖은 노랑. 마감이면 "마감".
export const DdayBadge = ({ closesAt, isClosed }) => {
  if (isClosed) return <DefaultBadge>마감</DefaultBadge>;
  const days = Math.max(daysUntilKst(closesAt), 0);
  return (
    <Badge tone={days <= 3 ? 'danger' : 'warning'} className="whitespace-nowrap font-num tabular-nums">
      {formatDday(days)}
    </Badge>
  );
};
