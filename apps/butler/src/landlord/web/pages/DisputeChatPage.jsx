import { useEffect, useRef, useState } from 'react';
import { List } from 'lucide-react';
import { ChatComposer } from '../components/DisputeChat/ChatComposer';
import { ChatMessage } from '../components/DisputeChat/ChatMessage';
import { ChatSidebar } from '../components/DisputeChat/ChatSidebar';
import { EmptyChat } from '../components/DisputeChat/EmptyChat';
import { useDeleteDisputeChat } from '../hooks/useDeleteDisputeChat';
import { useGetDisputeChat } from '../hooks/useGetDisputeChat';
import { useGetDisputeChatList } from '../hooks/useGetDisputeChatList';
import { usePostDisputeChat } from '../hooks/usePostDisputeChat';
import { usePostDisputeChatMessage } from '../hooks/usePostDisputeChatMessage';
import { getErrorMessage } from '../utils/getErrorMessage';

// AI 분쟁 상담(임대차 분쟁 해결사). 질문하면 서버가 비슷한 조정사례·판례를 검색해서(RAG)
// 그 자료를 근거로 답한다. QueryClientProvider 안에서 렌더링해야 한다.
export const DisputeChatPage = () => {
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [draft, setDraft] = useState('');
  // 답변을 기다리는 동안 화면에 먼저 보여줄 질문
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isListOpen, setIsListOpen] = useState(false);
  const bottomRef = useRef(null);

  const chatList = useGetDisputeChatList();
  const chat = useGetDisputeChat(selectedChatId);
  const startChat = usePostDisputeChat();
  const sendMessage = usePostDisputeChatMessage();
  const deleteChat = useDeleteDisputeChat();

  const messages = selectedChatId ? (chat.data?.messages ?? []) : [];
  const isPending = pendingQuestion !== null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pendingQuestion]);

  const ask = async (question) => {
    setPendingQuestion(question);
    setDraft('');
    setErrorMessage('');
    try {
      if (selectedChatId) {
        await sendMessage.mutateAsync({ chatId: selectedChatId, message: question });
      } else {
        const created = await startChat.mutateAsync({ message: question });
        setSelectedChatId(created.id);
      }
    } catch (error) {
      // 실패한 질문은 서버에 저장되지 않으므로 입력창에 되돌려서 다시 보낼 수 있게 한다.
      setDraft(question);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setPendingQuestion(null);
    }
  };

  const selectChat = (chatId) => {
    setSelectedChatId(chatId);
    setErrorMessage('');
    setIsListOpen(false);
  };

  const removeChat = async (target) => {
    if (!window.confirm(`"${target.title}" 상담을 삭제할까요? 삭제하면 되돌릴 수 없어요.`)) return;
    try {
      await deleteChat.mutateAsync(target.id);
      if (target.id === selectedChatId) setSelectedChatId(null);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-eyebrow font-semibold text-ink-3">AI 도움 · 법률 자문 아님</p>
          <h2 className="mt-1 text-h1 font-semibold text-ink">AI 분쟁 상담</h2>
          <p className="mt-1 text-sub text-ink-2">
            주택·상가건물 임대차 조정사례와 판례를 근거로 답해요. 답변은 참고 정보이며 법률 자문이 아니에요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsListOpen((open) => !open)}
          aria-expanded={isListOpen}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-btn border border-line bg-surface px-3 text-label font-semibold text-ink lg:hidden"
        >
          <List size={16} />
          상담 목록
        </button>
      </div>

      <div className="flex gap-4">
        <aside className={`${isListOpen ? 'block' : 'hidden'} w-full lg:block lg:w-72 lg:shrink-0`}>
          <ChatSidebar
            chats={chatList.data?.data ?? []}
            isLoading={chatList.isLoading}
            selectedChatId={selectedChatId}
            pendingTitle={isPending && !selectedChatId ? pendingQuestion : null}
            onSelect={selectChat}
            onNewChat={() => selectChat(null)}
            onDelete={removeChat}
          />
        </aside>

        <section className={`${isListOpen ? 'hidden' : 'flex'} min-w-0 flex-1 flex-col gap-3 lg:flex`}>
          <div className="space-y-3" aria-live="polite">
            {selectedChatId && chat.isLoading && <p className="text-sub text-ink-3">상담 내용을 불러오는 중…</p>}
            {!selectedChatId && !isPending && <EmptyChat onPick={ask} disabled={isPending} />}

            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}

            {isPending && (
              <>
                <ChatMessage message={{ id: 'pending', role: 'USER', content: pendingQuestion }} />
                <div className="max-w-2xl rounded-card border border-line bg-surface px-4 py-3">
                  <p className="text-body text-ink-2">비슷한 사례를 찾고 답변을 쓰고 있어요. 보통 10초 안팎 걸려요.</p>
                </div>
              </>
            )}
            <div ref={bottomRef} />
          </div>

          {errorMessage && (
            <p role="alert" className="rounded-input border border-crit bg-crit-soft px-4 py-3 text-body text-crit-ink">
              {errorMessage}
            </p>
          )}

          <ChatComposer value={draft} onChange={setDraft} onSubmit={() => ask(draft.trim())} isPending={isPending} />
        </section>
      </div>
    </div>
  );
};
