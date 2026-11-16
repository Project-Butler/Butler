import { IconTile } from '../IconTile/IconTile';

// 빈 상태: 아이콘 + 안내 + (있으면) 회복 행동. "데이터 없음" 같은 날 문구 대신 다음 행동을 알려 준다.
export const EmptyState = ({ icon, title, description, action, className = '' }) => (
  <div className={`flex flex-col items-center gap-3 px-6 py-14 text-center ${className}`}>
    <IconTile icon={icon} tone="mute" size="lg" />
    <p className="text-card font-semibold text-ink">{title}</p>
    {description && <p className="max-w-sm text-body text-ink-3">{description}</p>}
    {action}
  </div>
);
