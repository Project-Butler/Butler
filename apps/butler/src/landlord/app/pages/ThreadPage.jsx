import { useEffect, useRef } from 'react';
import { Button, MobileFormLayout } from '@butler/ui';
import { NoticeBox } from '../../../shared/NoticeBox';
import { MessageList } from '../../../shared/threads/MessageList';
import { ThreadComposer } from '../../../shared/threads/ThreadComposer';
import { IMMUTABLE_NOTICE, READ_ONLY_NOTICE } from '../../../shared/threads/threadRules';
import { getThreadTitle } from '../../../shared/threads/threadView';
import { useThreadComposer } from '../../../shared/threads/useThreadComposer';
import { useThreadConversation } from '../../../shared/threads/useThreadConversation';
import { useGoBack } from '../utils/navigation';

// 임대인 앱 소통 (Figma M10). 계약·수리 요청마다 하나씩 있는 임대인-임차인 대화방.
// 새 메시지는 10초마다 받아 오고(실시간 연결 없음), 화면에 들어오면 마지막 메시지까지 읽음으로 표시한다.
// 말풍선·입력칸·대화 훅은 공용(shared/threads)이다. 메시지 사진 첨부 보내기는 아직 켜지 않았다(받은 첨부는 보여 준다).
export const ThreadPage = ({ threadId, user, onUnauthorized }) => {
  const goBack = useGoBack('tickets');
  const endRef = useRef(null);
  const conversation = useThreadConversation(threadId, { onUnauthorized });
  const { thread, messages, error, hasOlder, isLoadingOlder, olderError, loadOlder } = conversation;
  const composer = useThreadComposer(conversation, { onUnauthorized, attachEnabled: false });

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

  return (
    <MobileFormLayout
      shell="landlord-app-detail"
      topBar={{ title: getThreadTitle(thread, user?.id), onBack: goBack }}
      onSubmit={composer.submit}
      cta={<ThreadComposer composer={composer} />}
    >
      <p className="rounded-input bg-surface-2 px-4 py-3 text-m-sub text-ink-2">{IMMUTABLE_NOTICE}</p>
      {readOnly && <NoticeBox tone="info">{READ_ONLY_NOTICE}</NoticeBox>}

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
