import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@butler/ui';
import { formatShortDateTime } from '../../utils/formatDateTime';

// pendingTitle: 새 대화의 첫 질문을 보내고 답변을 기다리는 중이면 그 질문(아직 서버에 없는 대화)
export const ChatSidebar = ({ chats, isLoading, selectedChatId, pendingTitle, onSelect, onNewChat, onDelete }) => (
  <div className="flex h-full flex-col rounded-card border border-line bg-surface">
    <div className="border-b border-line p-3">
      <Button variant="secondary" onClick={onNewChat} className="flex min-h-11 w-full items-center justify-center gap-1.5">
        <Plus size={16} />새 상담
      </Button>
    </div>

    <div className="flex-1 overflow-y-auto p-2">
      {isLoading && <p className="px-2 py-3 text-sub text-ink-3">상담 목록을 불러오는 중…</p>}
      {!isLoading && chats.length === 0 && !pendingTitle && (
        <p className="px-2 py-3 text-sub text-ink-3">아직 상담 기록이 없어요.</p>
      )}

      <ul className="space-y-0.5">
        {pendingTitle && (
          <li aria-current="true" className="min-h-11 rounded-input bg-accent-soft px-3 py-2">
            <p className="truncate text-body font-semibold text-accent-strong">{pendingTitle}</p>
            <p className="text-chip text-ink-3">답변 기다리는 중…</p>
          </li>
        )}
        {chats.map((chat) => {
          const isActive = chat.id === selectedChatId;
          return (
            <li key={chat.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(chat.id)}
                aria-current={isActive ? 'true' : undefined}
                className={`min-h-11 min-w-0 flex-1 rounded-input px-3 py-2 text-left transition-colors ${
                  isActive ? 'bg-accent-soft' : 'hover:bg-surface-2'
                }`}
              >
                <p className={`truncate text-body ${isActive ? 'font-semibold text-accent-strong' : 'font-medium text-ink'}`}>
                  {chat.title}
                </p>
                <p className="font-num text-chip tabular-nums text-ink-3">{formatShortDateTime(chat.updatedAt)}</p>
              </button>
              <button
                type="button"
                onClick={() => onDelete(chat)}
                aria-label={`${chat.title} 상담 삭제`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-input text-ink-3 transition-colors hover:bg-surface-2 hover:text-crit-ink"
              >
                <Trash2 size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  </div>
);
