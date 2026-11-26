import { MessageBubble } from './MessageBubble';
import { groupMessagesByDay, isMyMessage } from './threadView';
import { EMPTY_THREAD_TEXT } from './threadRules';

// 날짜 줄로 묶은 메시지 목록. messages 는 오래된 것 → 최신 순. 메시지가 없으면 빈 대화 안내.
export const MessageList = ({ messages, myUserId, onUnauthorized }) => {
  if (messages.length === 0) return <p className="py-10 text-center text-body text-ink-3">{EMPTY_THREAD_TEXT}</p>;
  return groupMessagesByDay(messages).map((group) => (
    <section key={group.key} aria-label={group.label} className="flex flex-col gap-3">
      <p className="font-num text-m-sub tabular-nums text-ink-3">{group.label}</p>
      <ul className="flex flex-col gap-3">
        {group.items.map((message) => (
          <MessageBubble key={message.id} message={message} mine={isMyMessage(message, myUserId)} onUnauthorized={onUnauthorized} />
        ))}
      </ul>
    </section>
  ));
};
