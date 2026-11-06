import { Card } from '@butler/ui';

// 빈 상태: Card 가운데 정렬 — 제목 한 줄 + 설명 한 줄 + 필요하면 버튼(BuildingListPage 빈 상태와 같은 모양).
// bare 면 Card 없이 안쪽만(카드 안의 빈 상태).
export const EmptyState = ({ title, description, children, bare = false }) => {
  const content = (
    <>
      <p className="text-card font-semibold text-ink">{title}</p>
      {description && <p className="text-body text-ink-2">{description}</p>}
      {children}
    </>
  );
  if (bare) return <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">{content}</div>;
  return <Card className="flex flex-col items-center gap-3 px-5 py-16 text-center">{content}</Card>;
};
