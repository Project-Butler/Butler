import { DocumentThumbnail } from '../documentViewer/DocumentThumbnail';
import { formatMessageTime } from './threadView';
import { HIDDEN_MESSAGE_TEXT } from './threadRules';

// 말풍선 하나. 내 메시지는 오른쪽(연한 초록), 상대 메시지는 왼쪽(흰 바탕). 운영자가 숨긴 메시지는 내용 대신 안내만.
// 2자 대화라 상대 이름은 상단 제목에만 두고 말풍선 위에는 붙이지 않는다.
export const MessageBubble = ({ message, mine, onUnauthorized }) => (
  <li className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
    <div className={`flex max-w-[80%] items-end gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
      <div className={`flex flex-col gap-2 rounded-card px-3.5 py-2.5 ${mine ? 'bg-accent-soft' : 'border border-line bg-surface'}`}>
        {message.isHidden ? (
          <p className="text-body italic text-ink-3">{HIDDEN_MESSAGE_TEXT}</p>
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
