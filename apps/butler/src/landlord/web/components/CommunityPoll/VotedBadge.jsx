import { Badge } from '@butler/ui';
import { DefaultBadge } from './DefaultBadge';

// 내 참여: "참여함"(초록 + 점) / "미참여"(회색 + 점)
export const VotedBadge = ({ hasVoted }) =>
  hasVoted ? (
    <Badge tone="success" className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <i aria-hidden="true" className="block h-1.5 w-1.5 rounded-full bg-ok" />
      참여함
    </Badge>
  ) : (
    <DefaultBadge>미참여</DefaultBadge>
  );
