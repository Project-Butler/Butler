import Markdown from 'react-markdown';
import { formatShortDateTime } from '../../utils/formatDateTime';
import { ReferenceList } from './ReferenceList';

// 답변 속 [1]을 근거 자료 목록으로 가는 링크로 바꿔서, 아래 a 렌더러가 번호 칩으로 그린다.
const linkCitations = (content, messageId) => content.replace(/\[(\d+)\]/g, `[$1](#ref-${messageId}-$1)`);

const MARKDOWN_COMPONENTS = {
  p: ({ children }) => <p className="text-body text-ink">{children}</p>,
  // 답변 속 제목은 말풍선 안의 소제목이라 카드 제목 크기로 맞춘다.
  h1: ({ children }) => <p className="pt-1 text-card font-semibold text-ink">{children}</p>,
  h2: ({ children }) => <p className="pt-1 text-card font-semibold text-ink">{children}</p>,
  h3: ({ children }) => <p className="pt-1 text-card font-semibold text-ink">{children}</p>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 text-body text-ink">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 text-body text-ink">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href, children }) =>
    href?.startsWith('#ref-') ? (
      <a
        href={href}
        aria-label={`근거 자료 ${children}`}
        className="mx-0.5 rounded-chip bg-accent-soft px-1.5 py-0.5 align-middle font-num text-chip font-semibold tabular-nums text-accent-strong no-underline hover:bg-surface-2"
      >
        {children}
      </a>
    ) : (
      <a href={href} target="_blank" rel="noreferrer" className="text-accent underline hover:text-accent-strong">
        {children}
      </a>
    ),
};

// onOpenReference(referenceId): 주면 근거 자료 제목을 눌러 사례 상세를 열 수 있다.
export const ChatMessage = ({ message, onOpenReference }) => {
  if (message.role === 'USER') {
    return (
      <div className="flex justify-end">
        <div className="max-w-xl rounded-card bg-accent-soft px-4 py-3">
          <p className="whitespace-pre-wrap text-body text-ink">{message.content}</p>
          {message.createdAt && (
            <p className="mt-1 text-right font-num text-chip tabular-nums text-ink-3">
              {formatShortDateTime(message.createdAt)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl rounded-card border border-line bg-surface px-4 py-3 lg:px-5 lg:py-4">
      <div className="space-y-2">
        <Markdown components={MARKDOWN_COMPONENTS}>{linkCitations(message.content, message.id)}</Markdown>
      </div>
      <ReferenceList messageId={message.id} references={message.references} onOpenReference={onOpenReference} />
      <p className="mt-2 font-num text-chip tabular-nums text-ink-3">{formatShortDateTime(message.createdAt)}</p>
    </div>
  );
};
