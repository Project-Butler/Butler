import { Badge } from '@butler/ui';

// 점이 붙은 회색 칩("미참여", "마감")
export const DefaultBadge = ({ children }) => (
  <Badge className="inline-flex items-center gap-1.5 whitespace-nowrap border border-line">
    <i aria-hidden="true" className="block h-1.5 w-1.5 rounded-full bg-ink-3" />
    {children}
  </Badge>
);
