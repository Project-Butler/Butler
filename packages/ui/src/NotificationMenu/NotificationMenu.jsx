import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';

// 상단 바 종 아이콘 + 눌러서 여는 목록. items: [{ id, title, description, badge, onClick }]. 항목이 있으면 빨간 점을 단다.
export const NotificationMenu = ({ items = [], emptyText = '새 알림이 없어요', footer }) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={items.length > 0 ? `알림 ${items.length}건` : '알림'}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative flex h-9 w-9 items-center justify-center rounded-btn text-ink-2 transition-colors hover:bg-surface-2"
      >
        <Bell size={18} />
        {items.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-crit" />}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 overflow-hidden rounded-btn border border-line bg-surface">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-body text-ink-3">{emptyText}</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      item.onClick?.();
                    }}
                    className="block w-full px-4 py-3 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-body font-semibold text-ink">{item.title}</span>
                      {item.badge && <span className="shrink-0 font-num text-chip font-semibold tabular-nums text-warn-ink">{item.badge}</span>}
                    </span>
                    {item.description && <span className="mt-0.5 block font-num text-sub tabular-nums text-ink-2">{item.description}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {items.length > 0 && footer && <p className="border-t border-line bg-surface-2 px-4 py-3 text-sub text-ink-2">{footer}</p>}
        </div>
      )}
    </div>
  );
};
