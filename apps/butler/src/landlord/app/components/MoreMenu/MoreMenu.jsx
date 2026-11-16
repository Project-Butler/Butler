import { useEffect, useRef, useState } from 'react';
import { Ellipsis } from 'lucide-react';

// 상단 바 오른쪽 ⋯ 더보기. items: [{ key, label, onSelect }]. 항목이 없으면 버튼을 두지 않는다.
// 바깥을 누르거나 Esc 를 누르면 닫힌다.
export const MoreMenu = ({ items, label = '더보기' }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-11 w-11 items-center justify-center text-ink-2"
      >
        <Ellipsis size={22} aria-hidden="true" />
      </button>
      {open && (
        <ul role="menu" aria-label={label} className="absolute right-0 top-full z-20 min-w-40 rounded-input border border-line bg-surface py-1 shadow-md">
          {items.map((item) => (
            <li key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className="block w-full px-4 py-2.5 text-left text-body text-ink hover:bg-surface-2"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
