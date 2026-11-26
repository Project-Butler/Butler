import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, Lock, Minus, X } from 'lucide-react';
import { NoticeBox } from '../../../../shared/NoticeBox';
import { MessageList } from '../../../../shared/threads/MessageList';
import { ThreadComposer } from '../../../../shared/threads/ThreadComposer';
import { ThreadList } from '../../../../shared/threads/ThreadList';
import { EMPTY_READ_ONLY_THREAD_TEXT, IMMUTABLE_NOTICE, READ_ONLY_NOTICE } from '../../../../shared/threads/threadRules';
import { getThreadCounterpartName, getThreadCounterpartRoleLabel } from '../../../../shared/threads/threadView';
import { useGetThreadList } from '../../../../shared/threads/useGetThreadList';
import { useThreadComposer } from '../../../../shared/threads/useThreadComposer';
import { useThreadConversation } from '../../../../shared/threads/useThreadConversation';
import { useThreadDock } from './ThreadDockContext';

// 위 막대 말풍선 버튼 id. 팝업을 닫으면 포커스를 여기로 돌려준다.
export const THREAD_DOCK_TRIGGER_ID = 'landlord-thread-dock-trigger';
const TITLE_ID = 'landlord-thread-dock-title';
const LIST_EMPTY_TEXT = '아직 대화가 없어요. 유지보수 요청 상세에서 임차인과 대화를 시작할 수 있어요.';

// 대화 제목을 누르면 그 계약·요청 상세로 간다.
const CONTEXT_TARGET = {
  CONTRACT: (contextId) => ['contractDetail', { contractId: contextId }],
  TICKET: (contextId) => ['ticketDetail', { ticketId: contextId }],
};

const IconButton = ({ label, onClick, children }) => (
  <button type="button" aria-label={label} onClick={onClick} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn text-ink-2 hover:bg-surface-2">
    {children}
  </button>
);

const WindowButtons = ({ dock }) => (
  <>
    <IconButton label="대화 접기" onClick={dock.collapse}>
      <Minus size={18} aria-hidden="true" />
    </IconButton>
    <IconButton label="대화 닫기" onClick={dock.close}>
      <X size={18} aria-hidden="true" />
    </IconButton>
  </>
);

// P1 대화 목록
const DockList = ({ dock, threads }) => (
  <>
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface pl-4 pr-2">
      <h2 id={TITLE_ID} tabIndex={-1} className="text-card font-semibold text-ink outline-none">
        대화
      </h2>
      <div className="flex">
        <WindowButtons dock={dock} />
      </div>
    </header>
    <div className="flex-1 overflow-y-auto p-3">
      {threads.error ? (
        <NoticeBox>{threads.error.message}</NoticeBox>
      ) : threads.isLoading ? (
        <p role="status" className="py-10 text-center text-body text-ink-3">
          불러오는 중입니다
        </p>
      ) : (
        <ThreadList threads={threads.items} myUserId={dock.userId} emptyText={LIST_EMPTY_TEXT} onOpen={(thread) => dock.openThread(thread.id)} />
      )}
    </div>
  </>
);

// P2 대화. 접힌 동안에도 그려 두되(쓰던 글·첨부 유지) isActive=false 로 폴링·읽음을 멈춘다.
const DockConversation = ({ dock, threadId, active }) => {
  const endRef = useRef(null);
  const conversation = useThreadConversation(threadId, { onUnauthorized: dock.onUnauthorized, isActive: active });
  const { thread, messages, error, hasOlder, isLoadingOlder, olderError, loadOlder } = conversation;
  const composer = useThreadComposer(conversation, { onUnauthorized: dock.onUnauthorized, attachEnabled: Boolean(thread) && !thread.isReadOnly });

  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (lastMessageId && active) endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [lastMessageId, active]);

  const readOnly = Boolean(thread?.isReadOnly);
  const target = thread ? CONTEXT_TARGET[thread.contextType]?.(thread.contextId) : null;
  const subtitle = thread ? [thread.title, readOnly ? '지난 대화' : null].filter(Boolean).join(' · ') : null;

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line bg-surface pl-1 pr-2">
        <IconButton label="대화 목록" onClick={dock.backToList}>
          <ChevronLeft size={20} aria-hidden="true" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h2 id={TITLE_ID} tabIndex={-1} className="truncate text-body font-semibold leading-tight text-ink outline-none">
            {thread ? getThreadCounterpartName(thread, dock.userId) ?? '대화' : '대화'}
            {thread && getThreadCounterpartRoleLabel(thread, dock.userId) && (
              <>
                {' '}
                <span className="text-sub font-normal text-ink-3">{getThreadCounterpartRoleLabel(thread, dock.userId)}</span>
              </>
            )}
          </h2>
          {subtitle &&
            (target && dock.onNavigate ? (
              <button type="button" onClick={() => dock.onNavigate(...target)} className="flex max-w-full items-center gap-0.5 text-sub text-accent-strong">
                <span className="truncate">{subtitle}</span>
                <span className="sr-only">, 상세 보기</span>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            ) : (
              <p className="truncate text-sub text-ink-3">{subtitle}</p>
            ))}
        </div>
        <WindowButtons dock={dock} />
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {!thread ? (
          error ? (
            <NoticeBox>{error.message}</NoticeBox>
          ) : (
            <p role="status" className="py-10 text-center text-body text-ink-3">
              불러오는 중입니다
            </p>
          )
        ) : (
          <>
            <p className="rounded-input bg-surface-2 px-3.5 py-2.5 text-sub text-ink-2">{IMMUTABLE_NOTICE}</p>
            {hasOlder && (
              <button type="button" disabled={isLoadingOlder} onClick={loadOlder} className="mx-auto text-sub text-ink-3 underline disabled:opacity-50">
                {isLoadingOlder ? '불러오는 중' : olderError ? '다시 시도' : '이전 메시지 더 보기'}
              </button>
            )}
            {olderError && <NoticeBox>{olderError.message}</NoticeBox>}
            <MessageList
              messages={messages}
              myUserId={dock.userId}
              onUnauthorized={dock.onUnauthorized}
              emptyText={readOnly ? EMPTY_READ_ONLY_THREAD_TEXT : undefined}
            />
            {composer.errorText && <NoticeBox>{composer.errorText}</NoticeBox>}
            <div ref={endRef} />
          </>
        )}
      </div>

      {thread &&
        (readOnly ? (
          <div className="shrink-0 border-t border-line bg-surface px-3 py-3">
            <p role="status" className="flex items-start gap-2 rounded-input bg-surface-2 px-3.5 py-2.5 text-sub text-ink-2">
              <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {READ_ONLY_NOTICE}
            </p>
          </div>
        ) : (
          <form onSubmit={composer.submit} noValidate className="flex shrink-0 border-t border-line bg-surface px-3 pb-3 pt-2.5">
            <ThreadComposer composer={composer} showAttach showCounter inputId="thread-dock-message" />
          </form>
        ))}
    </>
  );
};

// P3 접힘 막대: 상대 이름(대화) 또는 '대화'(목록) + 안 읽은 수. 누르면 펼친다.
const DockBar = ({ dock, threads, barRef }) => {
  const thread = dock.view === 'thread' ? threads.items.find((item) => item.id === dock.threadId) : null;
  const name = thread ? getThreadCounterpartName(thread, dock.userId) : null;
  const label = thread ? [name, thread.title].filter(Boolean).join(' · ') : '대화';
  // 대화를 보다 접었으면 그 대화 숫자만(목록 첫 100개에 없으면 0), 목록에서 접었으면 안 읽은 대화 수.
  const unread = dock.view === 'thread' ? (thread?.unreadCount ?? 0) : threads.items.filter((item) => item.unreadCount > 0).length;
  return (
    <button
      ref={barRef}
      type="button"
      onClick={dock.expand}
      aria-label={`${label} 펼치기${unread > 0 ? `, 안 읽은 메시지 ${unread}개` : ''}`}
      className="fixed bottom-6 right-6 z-30 flex h-14 max-w-[280px] items-center gap-2.5 rounded-full border border-line bg-surface pl-3 pr-4 shadow-xl motion-safe:animate-[thread-dock-up_0.2s_ease-out]"
    >
      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-chip font-semibold text-accent-strong">
        {name?.trim()?.[0] ?? '대'}
      </span>
      <span className="min-w-0 truncate text-body font-semibold text-ink">{label}</span>
      {unread > 0 && (
        <span aria-hidden="true" className="min-w-[18px] shrink-0 rounded-full bg-crit px-1 text-center font-num text-[11px] font-semibold leading-[18px] text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
      <ChevronUp size={18} className="shrink-0 text-ink-3" aria-hidden="true" />
    </button>
  );
};

// 오른쪽 아래 대화 팝업(시안 P1~P4). 막지 않는 창이라 뒤 화면은 그대로 쓸 수 있다(바깥 클릭·Esc 로 닫지 않음).
// 1024 이상: 오른쪽 아래 380 × 최대 640 / 미만: 위 막대 아래부터 오른쪽 패널.
export const ThreadDock = () => {
  const dock = useThreadDock();
  const threads = useGetThreadList({ onUnauthorized: dock?.onUnauthorized, enabled: Boolean(dock) && dock.status !== 'closed' });
  const barRef = useRef(null);
  const status = dock?.status;
  const screenKey = dock ? `${dock.status}:${dock.view}:${dock.threadId ?? ''}` : 'none';
  const previousKey = useRef(screenKey);

  // 열거나 다른 화면(목록↔대화)으로 바꾸면 제목, 접으면 막대, 닫으면 위 막대 말풍선으로 포커스를 옮긴다(처음 그릴 때는 옮기지 않는다).
  useEffect(() => {
    if (previousKey.current === screenKey) return;
    const wasClosed = previousKey.current.startsWith('closed');
    previousKey.current = screenKey;
    if (status === 'open') document.getElementById(TITLE_ID)?.focus();
    else if (status === 'collapsed') barRef.current?.focus();
    else if (status === 'closed' && !wasClosed) document.getElementById(THREAD_DOCK_TRIGGER_ID)?.focus();
  }, [screenKey, status]);

  if (!dock || dock.status === 'closed') return null;
  const isOpen = dock.status === 'open';

  return (
    <>
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby={TITLE_ID}
        hidden={!isOpen}
        className={`fixed bottom-0 right-0 top-16 z-30 w-full max-w-[380px] flex-col overflow-hidden border-l border-line bg-ground shadow-2xl motion-safe:animate-[thread-dock-up_0.2s_ease-out] lg:right-6 lg:top-auto lg:h-[min(640px,calc(100vh-24px))] lg:w-[380px] lg:rounded-t-[20px] lg:border ${isOpen ? 'flex' : 'hidden'}`}
      >
        {dock.view === 'thread' && dock.threadId ? (
          <DockConversation key={dock.threadId} dock={dock} threadId={dock.threadId} active={isOpen} />
        ) : (
          <DockList dock={dock} threads={threads} />
        )}
      </section>
      {!isOpen && <DockBar dock={dock} threads={threads} barRef={barRef} />}
    </>
  );
};
