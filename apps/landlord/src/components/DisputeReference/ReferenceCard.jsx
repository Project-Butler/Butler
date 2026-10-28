import { Badge } from '@butler/ui';
import { CATEGORY_LABELS, TYPE_LABELS } from '../../utils/disputeReference';

// 분쟁 참고자료 목록 카드. 카드 전체가 눌리는 영역(design.md §5 카드).
export const ReferenceCard = ({ reference, onOpen }) => (
  <button
    type="button"
    onClick={() => onOpen(reference.id)}
    className="w-full rounded-card border border-line bg-surface p-4 text-left transition-colors hover:bg-surface-2 lg:p-5"
  >
    <div className="flex items-center justify-between gap-2">
      <Badge>{TYPE_LABELS[reference.type] ?? '참고자료'}</Badge>
      <span className="text-sub text-ink-3">{CATEGORY_LABELS[reference.category]}</span>
    </div>
    <p className="mt-3 break-keep text-card font-semibold text-ink">{reference.title}</p>
    <p className="mt-1 line-clamp-2 text-sub text-ink-2">{reference.summary}</p>
  </button>
);
