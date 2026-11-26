import { formatThreadListTime, getLastMessagePreview, getThreadCounterpartName } from './threadView';

// 대화 목록 한 줄(2-2): 상대 이름 · 대화 제목, 마지막 메시지 한 줄, 시각, 안 읽은 수, 읽기 전용이면 "지난 대화" 칩.
// 역할 폴더를 모르게 myUserId·onOpen 만 받는다.
export const ThreadListItem = ({ thread, myUserId, onOpen, now }) => {
  const name = getThreadCounterpartName(thread, myUserId);
  const heading = [name, thread.title].filter(Boolean).join(' · ') || '대화';
  const time = formatThreadListTime(thread.lastMessage?.sentAt ?? thread.createdAt, now);
  const unread = thread.unreadCount > 0 ? thread.unreadCount : 0;
  const readOnly = thread.isReadOnly;
  const label = [heading, unread > 0 ? `안 읽은 메시지 ${unread}개` : null, readOnly ? '지난 대화' : null].filter(Boolean).join(', ');

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(thread)}
        aria-label={label}
        className={`flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-surface-2 ${readOnly ? 'opacity-80' : ''}`}
      >
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-m-chip font-semibold ${
            readOnly ? 'bg-surface-2 text-ink-3' : 'bg-accent-soft text-accent-strong'
          }`}
        >
          {name?.trim()?.[0] ?? '○'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className={`truncate text-body ${readOnly ? 'text-ink-2' : 'font-semibold text-ink'}`}>{heading}</span>
            <span className="shrink-0 whitespace-nowrap font-num text-chip tabular-nums text-ink-3">{time}</span>
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            {readOnly && <span className="shrink-0 rounded-chip bg-surface-2 px-2 py-0.5 text-chip font-semibold text-ink-3">지난 대화</span>}
            <span className={`min-w-0 flex-1 truncate text-m-sub ${unread > 0 ? 'text-ink-2' : 'text-ink-3'}`}>
              {getLastMessagePreview(thread, myUserId)}
            </span>
            {unread > 0 && (
              <span
                aria-hidden="true"
                className="min-w-[18px] shrink-0 rounded-full bg-crit px-1 text-center font-num text-[11px] font-semibold leading-[18px] text-white tabular-nums"
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
};
