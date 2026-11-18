import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Button, MobileFormLayout } from '@butler/ui';
import { DocumentThumbnail } from '../../web/components/DocumentThumbnail/DocumentThumbnail';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { useThreadConversation } from '../../web/hooks/useThreadConversation';
import { formatMessageTime, getThreadTitle, groupMessagesByDay, isMyMessage } from '../utils/threadView';
import { useGoBack } from '../utils/navigation';

const MAX_MESSAGE_LENGTH = 2000;
const IMMUTABLE_NOTICE = '보낸 메시지는 수정·삭제할 수 없어요.';
const READ_ONLY_NOTICE = '끝난 계약·요청의 대화라 지금은 읽기만 할 수 있어요.';

// 말풍선 하나. 내 메시지는 오른쪽(연한 초록), 상대 메시지는 왼쪽(흰 바탕). 운영자가 숨긴 메시지는 내용 대신 안내만.
// 2자 대화라 상대 이름은 상단 제목에만 두고 말풍선 위에는 붙이지 않는다.
const MessageBubble = ({ message, mine, onUnauthorized }) => (
  <li className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
    <div className={`flex max-w-[80%] items-end gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
      <div className={`flex flex-col gap-2 rounded-card px-3.5 py-2.5 ${mine ? 'bg-accent-soft' : 'border border-line bg-surface'}`}>
        {message.isHidden ? (
          <p className="text-body italic text-ink-3">운영자가 숨긴 메시지입니다</p>
        ) : (
          <>
            {message.body && <p className="whitespace-pre-wrap break-words text-body text-ink">{message.body}</p>}
            {message.attachments.length > 0 && (
              <ul className="grid grid-cols-2 gap-1.5">
                {message.attachments.map((document) => (
                  <li key={document.id} className="w-24">
                    <DocumentThumbnail document={document} onUnauthorized={onUnauthorized} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <time dateTime={message.sentAt} className="shrink-0 font-num text-chip tabular-nums text-ink-3">
        {formatMessageTime(message.sentAt)}
      </time>
    </div>
  </li>
);

// 임대인 앱 소통 (Figma M10). 계약·수리 요청마다 하나씩 있는 임대인-임차인 대화방.
// 새 메시지는 10초마다 받아 오고(실시간 연결 없음), 화면에 들어오면 마지막 메시지까지 읽음으로 표시한다.
// 메시지 사진 첨부는 아직 보내지 않는다(받은 첨부는 보여 준다).
export const ThreadPage = ({ threadId, user, onUnauthorized }) => {
  const goBack = useGoBack('tickets');
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);
  const {
    thread,
    messages,
    error,
    hasOlder,
    isLoadingOlder,
    olderError,
    loadOlder,
    sendMessage,
    isSending,
    sendError,
  } = useThreadConversation(threadId, { onUnauthorized });

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
  const trimmed = draft.trim();
  const canSend = !readOnly && !isSending && trimmed.length > 0 && trimmed.length <= MAX_MESSAGE_LENGTH;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSend) return;
    const sent = await sendMessage(trimmed);
    if (sent) setDraft('');
  };

  return (
    <MobileFormLayout
      shell="landlord-app-detail"
      topBar={{ title: getThreadTitle(thread, user?.id), onBack: goBack }}
      onSubmit={handleSubmit}
      cta={
        <>
          <label htmlFor="thread-message" className="sr-only">
            메시지
          </label>
          <textarea
            id="thread-message"
            rows={1}
            value={draft}
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={readOnly || isSending}
            placeholder={readOnly ? '읽기 전용 대화예요' : '메시지 입력'}
            onChange={(event) => setDraft(event.target.value)}
            className="max-h-28 min-h-12 min-w-0 flex-1 resize-none rounded-input border border-line bg-surface px-3.5 py-3 text-body text-ink outline-none focus:border-accent disabled:bg-surface-2"
          />
          <Button type="submit" size="h48" aria-label="보내기" disabled={!canSend} className="shrink-0">
            <Send size={18} aria-hidden="true" />
          </Button>
        </>
      }
    >
      <p className="rounded-input bg-surface-2 px-4 py-3 text-m-sub text-ink-2">{IMMUTABLE_NOTICE}</p>
      {readOnly && <NoticeBox tone="info">{READ_ONLY_NOTICE}</NoticeBox>}

      {hasOlder && (
        <Button variant="secondary" size="h44" disabled={isLoadingOlder} onClick={loadOlder}>
          {isLoadingOlder ? '불러오는 중' : olderError ? '다시 시도' : '이전 메시지 더 보기'}
        </Button>
      )}
      {olderError && <NoticeBox>{olderError.message}</NoticeBox>}

      {messages.length === 0 ? (
        <p className="py-10 text-center text-body text-ink-3">아직 메시지가 없어요. 먼저 인사를 건네 보세요.</p>
      ) : (
        groupMessagesByDay(messages).map((group) => (
          <section key={group.key} aria-label={group.label} className="flex flex-col gap-3">
            <p className="font-num text-m-sub tabular-nums text-ink-3">{group.label}</p>
            <ul className="flex flex-col gap-3">
              {group.items.map((message) => (
                <MessageBubble key={message.id} message={message} mine={isMyMessage(message, user?.id)} onUnauthorized={onUnauthorized} />
              ))}
            </ul>
          </section>
        ))
      )}

      {sendError && <NoticeBox>{sendError.message}</NoticeBox>}
      <div ref={endRef} />
    </MobileFormLayout>
  );
};
