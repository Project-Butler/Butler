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
// 입력창은 항상 화면 아래에 둔다. 웹은 화면 높이에 맞춘 틀 안에서 대화만 스크롤하고(AppShell 헤더 h-16 + main p-6 위아래 = 7rem),
// 앱(isApp, 상단 바 'AI 상담')은 페이지가 스크롤되고 입력창이 아래에 붙는다. 앱에서는 제목이 상단 바와 겹쳐 안쪽 제목과 그 위 한 줄을 숨기고, '법률 자문이 아니에요' 설명만 남긴다.
// initialDraft: 사례 상세·상황 안내에서 넘긴 질문. 입력창에 미리 넣기만 하고 보내지는 않는다(경로가 history state 에서 꺼내 준다 — useHistoryDraft).
export const DisputeChatPage = ({ isApp = false, initialDraft = '' }) => {
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [draft, setDraft] = useState(initialDraft);
  // 답변을 기다리는 동안 화면에 먼저 보여줄 질문
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isListOpen, setIsListOpen] = useState(false);
  // 마지막 질문(보내는 중이면 그 질문). 질문을 보내거나 답이 오면 이 질문을 화면 위쪽에 맞춘다.
  const lastQuestionRef = useRef(null);

  const chatList = useGetDisputeChatList();
  const chat = useGetDisputeChat(selectedChatId);
  const startChat = usePostDisputeChat();
  const sendMessage = usePostDisputeChatMessage();
  const deleteChat = useDeleteDisputeChat();

  const messages = selectedChatId ? (chat.data?.messages ?? []) : [];
  const isPending = pendingQuestion !== null;
  const lastQuestionIndex = messages.findLastIndex((message) => message.role === 'USER');
  const scrollMargin = isApp ? 'scroll-mt-16' : 'scroll-mt-1';

  // 대화 맨 끝으로 내리면 긴 답은 첫머리를 지나치고, 앱에서는 아래에 붙은 입력창이 끝부분을 가린다.
  // 그래서 질문과 답 첫머리가 함께 보이도록 마지막 질문을 위쪽에 맞춘다(scroll-mt-16: 앱 상단 바 h-14 + 8px. 더 띄우면 위 칸의 잘린 끝이 상단 바 밑에 비친다).
  useEffect(() => {
    lastQuestionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
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
    <div className={`flex flex-col gap-4 ${isApp ? 'flex-1' : 'h-[calc(100vh-7rem)] min-h-[28rem]'}`}>
      <div className={`flex justify-between gap-3 ${isApp ? 'items-center' : 'items-start'}`}>
        <div>
          {!isApp && (
            <>
              <p className="text-eyebrow font-semibold text-ink-3">AI 도움 · 법률 자문 아님</p>
              <h2 className="mt-1 text-h1 font-semibold text-ink">AI 분쟁 상담</h2>
            </>
          )}
          <p className={`text-sub text-ink-2 ${isApp ? '' : 'mt-1'}`}>
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

      <div className={`flex flex-1 gap-4 ${isApp ? '' : 'min-h-0'}`}>
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
          <div className={`flex-1 space-y-3 ${isApp ? '' : 'min-h-0 overflow-y-auto'}`} aria-live="polite">
            {selectedChatId && chat.isLoading && <p className="text-sub text-ink-3">상담 내용을 불러오는 중…</p>}
            {!selectedChatId && !isPending && <EmptyChat onPick={ask} disabled={isPending} compact={isApp} />}

            {messages.map((message, index) => (
              <div key={message.id} ref={!isPending && index === lastQuestionIndex ? lastQuestionRef : undefined} className={scrollMargin}>
                <ChatMessage message={message} />
              </div>
            ))}

            {isPending && (
              <>
                <div ref={lastQuestionRef} className={scrollMargin}>
                  <ChatMessage message={{ id: 'pending', role: 'USER', content: pendingQuestion }} />
                </div>
                <div className="max-w-2xl rounded-card border border-line bg-surface px-4 py-3">
                  <p className="text-body text-ink-2">비슷한 사례를 찾고 답변을 쓰고 있어요. 보통 10초 안팎 걸려요.</p>
                </div>
              </>
            )}
          </div>

          <div className={isApp ? 'sticky bottom-0 -mx-5 flex flex-col gap-3 bg-ground px-5 pb-3 pt-2' : 'flex flex-col gap-3'}>
            {errorMessage && (
              <p role="alert" className="rounded-input border border-crit bg-crit-soft px-4 py-3 text-body text-crit-ink">
                {errorMessage}
              </p>
            )}

            <ChatComposer value={draft} onChange={setDraft} onSubmit={() => ask(draft.trim())} isPending={isPending} compact={isApp} />
          </div>
        </section>
      </div>
    </div>
  );
};
