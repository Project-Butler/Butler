import { useEffect, useRef } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Badge, Button } from '@butler/ui';
import { formatShortDateTime } from '../../utils/formatDateTime';
import { ChatComposer } from './ChatComposer';
import { ChatMessage } from './ChatMessage';

// 분쟁 해결사 PC 화면 오른쪽 AI 상담 패널. 처음에는 안내와 [질문하기]만 보여서
// 사용자가 왼쪽 사례 목록을 먼저 훑어보게 하고, 열면 그 자리에서 대화한다.
// conversation: useDisputeConversation() 결과(분쟁 해결사 화면이 들고 있어서 사례를 오가도 대화가 유지된다)
export const DisputeChatPanel = ({ conversation, isOpen, onOpen, onOpenReference }) => {
  const bottomRef = useRef(null);
  const {
    chats,
    isChatLoading,
    selectedChatId,
    messages,
    draft,
    setDraft,
    pendingQuestion,
    isPending,
    errorMessage,
    ask,
    selectChat,
  } = conversation;

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [isOpen, messages.length, pendingQuestion]);

  return (
    <aside
      aria-label="AI 상담"
      className="sticky top-0 flex max-h-screen w-96 shrink-0 flex-col self-start rounded-card border border-line bg-surface"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
        <p className="text-card font-semibold text-ink">AI 상담</p>
        <Badge>법률 자문 아님</Badge>
      </div>

      {!isOpen ? (
        <div className="flex flex-col items-center px-5 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-btn bg-accent-soft text-accent-strong">
            <Sparkles size={22} />
          </span>
          <p className="mt-4 text-card font-semibold text-ink">찾는 사례가 없나요?</p>
          <p className="mt-1 text-body text-ink-2">상황을 적어 주시면 조정사례·판례를 근거로 정리해 드려요.</p>
          <Button onClick={onOpen} className="mt-5 min-h-11 px-5">
            질문하기
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <label htmlFor="dispute-chat-history" className="sr-only">
              지난 상담
            </label>
            <select
              id="dispute-chat-history"
              value={selectedChatId ?? ''}
              onChange={(event) => selectChat(event.target.value || null)}
              className="min-h-11 min-w-0 flex-1 rounded-input border border-line bg-surface px-3 text-body text-ink focus:border-accent focus:outline-none"
            >
              <option value="">새 상담</option>
              {chats.map((chat) => (
                <option key={chat.id} value={chat.id}>
                  {formatShortDateTime(chat.updatedAt)} · {chat.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => selectChat(null)}
              aria-label="새 상담"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-input border border-line text-ink-2 transition-colors hover:bg-surface-2"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-ground p-4" aria-live="polite">
            {isChatLoading && <p className="text-sub text-ink-3">상담 내용을 불러오는 중…</p>}
            {!selectedChatId && !isPending && (
              <p className="text-body text-ink-2">겪고 있는 상황을 적어 주세요. 비슷한 사례를 찾아 답해 드려요.</p>
            )}
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} onOpenReference={onOpenReference} />
            ))}
            {isPending && (
              <>
                <ChatMessage message={{ id: 'pending', role: 'USER', content: pendingQuestion }} />
                <p className="rounded-card border border-line bg-surface px-4 py-3 text-body text-ink-2">
                  비슷한 사례를 찾고 답변을 쓰고 있어요. 보통 10초 안팎 걸려요.
                </p>
              </>
            )}
            <div ref={bottomRef} />
          </div>

          {errorMessage && (
            <p role="alert" className="border-t border-crit bg-crit-soft px-4 py-3 text-body text-crit-ink">
              {errorMessage}
            </p>
          )}

          <div className="border-t border-line p-3">
            <ChatComposer value={draft} onChange={setDraft} onSubmit={() => ask(draft.trim())} isPending={isPending} />
          </div>
        </>
      )}
    </aside>
  );
};
