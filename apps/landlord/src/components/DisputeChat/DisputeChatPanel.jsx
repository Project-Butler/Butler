import { useEffect, useRef } from 'react';
import { PanelRightClose, Plus, Sparkles } from 'lucide-react';
import { Badge } from '@butler/ui';
import { formatShortDateTime } from '../../utils/formatDateTime';
import { ChatComposer } from './ChatComposer';
import { ChatMessage } from './ChatMessage';

// 임대차 분쟁 PC 화면 오른쪽에 늘 붙어 있는 AI. 왼쪽 안내를 읽다가 어려우면 바로 옆에서 물어보게 한다.
// [접기]로 접으면 오른쪽 아래 버튼만 남고, 접어도 대화는 남는다(대화 상태는 임대차 분쟁 화면이 들고 있다).
// suggestions: 보고 있는 화면에 맞춘 질문 칩. 누르면 입력창에 채우기만 하고 보내지는 않는다.
// conversation: useDisputeConversation() 결과
export const DisputeChatPanel = ({ conversation, suggestions = [], isCollapsed, onCollapse, onExpand, onOpenReference }) => {
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
    if (!isCollapsed) bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [isCollapsed, messages.length, pendingQuestion]);

  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={onExpand}
        // 본문의 초록 버튼·박스와 겹쳐 보이지 않게, 반투명 흰 바탕(유리 느낌) + 선으로 띄운다(그림자 없음).
        className="fixed bottom-6 right-6 z-20 flex min-h-11 items-center gap-2 rounded-full border border-accent bg-surface/80 px-5 text-label font-semibold text-accent-strong backdrop-blur transition-colors hover:bg-accent-soft"
      >
        <Sparkles size={16} />
        AI에게 물어보기
      </button>
    );
  }

  return (
    <aside
      aria-label="AI에게 물어보기"
      // 위 바(64px)와 본문 여백만큼 빼서 처음부터 입력창까지 한 화면에 보이게 한다.
      style={{ height: 'calc(100vh - 6rem)' }}
      className="sticky top-6 flex w-96 shrink-0 flex-col self-start rounded-card border border-line bg-surface"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
        <p className="flex items-center gap-1.5 text-card font-semibold text-ink">
          <Sparkles size={16} className="text-accent" />
          AI에게 물어보기
        </p>
        <span className="flex items-center gap-1">
          <Badge>법률 자문 아님</Badge>
          <button
            type="button"
            onClick={onCollapse}
            aria-label="접기"
            className="flex h-11 w-11 items-center justify-center rounded-input text-ink-2 transition-colors hover:bg-surface-2"
          >
            <PanelRightClose size={18} />
          </button>
        </span>
      </div>

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
        {suggestions.length > 0 && !draft && !isPending && (
          <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="이 화면에서 물어보기">
            {suggestions.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => setDraft(suggestion)}
                  className="min-h-9 rounded-full border border-line bg-surface px-3 text-left text-sub text-ink-2 transition-colors hover:bg-accent-soft hover:text-accent-strong"
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        )}
        <ChatComposer value={draft} onChange={setDraft} onSubmit={() => ask(draft.trim())} isPending={isPending} />
      </div>
    </aside>
  );
};
