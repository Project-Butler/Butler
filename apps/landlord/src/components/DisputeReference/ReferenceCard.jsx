import { Badge } from '@butler/ui';
import { ExternalLink } from 'lucide-react';
import { CATEGORY_LABELS, TYPE_LABELS } from '../../utils/disputeReference';

// 분쟁 참고자료 목록 카드. 카드 본문을 누르면 상세로 가고(design.md §5 카드),
// 아래 "원문 보기"는 판례·법령·사례집 원문을 새 탭으로 연다(버튼 안에 링크를 둘 수 없어 따로 둔다).
export const ReferenceCard = ({ reference, onOpen }) => (
  <div className="rounded-card border border-line bg-surface transition-colors hover:bg-surface-2">
    <button type="button" onClick={() => onOpen(reference.id)} className="w-full p-4 text-left lg:p-5">
      <div className="flex items-center justify-between gap-2">
        <Badge>{TYPE_LABELS[reference.type] ?? '참고자료'}</Badge>
        <span className="text-sub text-ink-3">{CATEGORY_LABELS[reference.category]}</span>
      </div>
      <p className="mt-3 break-keep text-card font-semibold text-ink">{reference.title}</p>
      <p className="mt-1 line-clamp-2 text-sub text-ink-2">{reference.summary}</p>
    </button>
    {reference.sourceUrl && (
      <div className="-mt-2 px-4 pb-3 lg:px-5 lg:pb-4">
        <a
          href={reference.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1 text-sub text-accent hover:text-accent-strong"
        >
          원문 보기
          <ExternalLink size={14} aria-hidden="true" />
          <span className="sr-only">(새 탭, {reference.sourceTitle})</span>
        </a>
      </div>
    )}
  </div>
);
