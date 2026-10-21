import { Badge } from '@butler/ui';

const TYPE_LABELS = { CASE: '분쟁조정 사례', PRECEDENT: '판례', GUIDELINE: '제도 안내' };

// 답변의 [1], [2]가 가리키는 근거 자료. 번호는 references 순서(1부터)와 같다.
export const ReferenceList = ({ messageId, references }) => {
  if (references.length === 0) return null;

  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="text-eyebrow font-semibold text-ink-3">근거 자료</p>
      <ol className="mt-2 space-y-2">
        {references.map((reference, i) => (
          <li key={reference.id} id={`ref-${messageId}-${i + 1}`} className="flex items-start gap-2">
            <span className="rounded-chip bg-surface-2 px-1.5 py-0.5 font-num text-chip font-semibold tabular-nums text-accent-strong">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-ink">{reference.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sub text-ink-2">
                <Badge>{TYPE_LABELS[reference.type] ?? '참고자료'}</Badge>
                <span>{reference.sourceTitle}</span>
                {reference.sourcePage && <span className="font-num tabular-nums">p.{reference.sourcePage}</span>}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};
