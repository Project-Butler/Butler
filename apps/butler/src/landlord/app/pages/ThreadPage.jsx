import { useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import { Button, MobileFormLayout } from '@butler/ui';
import { NoticeBox } from '../../../shared/NoticeBox';
import { MessageList } from '../../../shared/threads/MessageList';
import { ThreadComposer } from '../../../shared/threads/ThreadComposer';
import { IMMUTABLE_NOTICE, READ_ONLY_NOTICE } from '../../../shared/threads/threadRules';
import { getThreadCounterpartName, getThreadCounterpartRoleLabel } from '../../../shared/threads/threadView';
import { useThreadComposer } from '../../../shared/threads/useThreadComposer';
import { useThreadConversation } from '../../../shared/threads/useThreadConversation';
import { useGoBack, useGoTo } from '../utils/navigation';

// 대화 제목을 누르면 그 계약·요청 상세로 간다.
const CONTEXT_TARGET = {
  CONTRACT: (contextId) => ['contractDetail', { contractId: contextId }],
  TICKET: (contextId) => ['ticketDetail', { ticketId: contextId }],
};

// 임대인 앱 소통 (Figma M10). 계약·수리 요청마다 하나씩 있는 임대인-임차인 대화방.
// 새 메시지는 10초마다 받아 오고(실시간 연결 없음), 화면에 들어오면 마지막 메시지까지 읽음으로 표시한다.
// 말풍선·입력칸·대화 훅은 공용(shared/threads)이다. 사진·PDF를 메시지당 5개까지 붙여 보낼 수 있다(시안 A2·A3).
// 위 막대: 상대 이름(역할) + 둘째 줄 대화 제목(누르면 계약·요청 상세). 끝난 대화는 입력칸 대신 잠금 안내(A4).
// 뒤로 가기: 들어온 화면으로, 주소로 바로 들어왔으면 대화 목록으로.
export const ThreadPage = ({ threadId, user, onUnauthorized }) => {
  const goBack = useGoBack('threads');
  const goTo = useGoTo();
  const endRef = useRef(null);
  const conversation = useThreadConversation(threadId, { onUnauthorized });
  const { thread, messages, error, hasOlder, isLoadingOlder, olderError, loadOlder } = conversation;
  const composer = useThreadComposer(conversation, { onUnauthorized });

  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  // 새 메시지가 붙으면 맨 아래로 내린다(이전 메시지를 위에 붙일 때는 마지막 메시지가 그대로라 움직이지 않는다).
  useEffect(() => {
    if (lastMessageId) endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [lastMessageId]);

  if (!thread) {
    return (
      <MobileFormLayout shell="landlord-app-detail" topBar={{ title: '대화', onBack: goBack }}>
        {error ? (
          <NoticeBox>{error.message}</NoticeBox>
        ) : (
          <p role="status" className="py-10 text-center text-body text-ink-3">
            불러오는 중입니다
          </p>
        )}
      </MobileFormLayout>
    );
  }

  const readOnly = thread.isReadOnly;
  const target = CONTEXT_TARGET[thread.contextType]?.(thread.contextId);

  return (
    <MobileFormLayout
      shell="landlord-app-detail"
      topBar={{
        title: getThreadCounterpartName(thread, user?.id) ?? '대화',
        titleNote: getThreadCounterpartRoleLabel(thread, user?.id),
        subtitle: [thread.title, readOnly ? '지난 대화' : null].filter(Boolean).join(' · ') || null,
        onSubtitleClick: target ? () => goTo(...target) : undefined,
        onBack: goBack,
      }}
      onSubmit={readOnly ? undefined : composer.submit}
      cta={
        readOnly ? (
          <p className="flex flex-1 items-start gap-2 rounded-input bg-surface-2 px-4 py-3 text-m-sub text-ink-2">
            <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {READ_ONLY_NOTICE}
          </p>
        ) : (
          <ThreadComposer composer={composer} showAttach showCounter />
        )
      }
    >
      <p className="rounded-input bg-surface-2 px-4 py-3 text-m-sub text-ink-2">{IMMUTABLE_NOTICE}</p>

      {hasOlder && (
        <Button variant="secondary" size="h44" disabled={isLoadingOlder} onClick={loadOlder}>
          {isLoadingOlder ? '불러오는 중' : olderError ? '다시 시도' : '이전 메시지 더 보기'}
        </Button>
      )}
      {olderError && <NoticeBox>{olderError.message}</NoticeBox>}

      <MessageList messages={messages} myUserId={user?.id} onUnauthorized={onUnauthorized} />

      {composer.errorText && <NoticeBox>{composer.errorText}</NoticeBox>}
      <div ref={endRef} />
    </MobileFormLayout>
  );
};
