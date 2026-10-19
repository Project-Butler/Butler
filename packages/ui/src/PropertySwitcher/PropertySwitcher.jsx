import { useEffect, useRef, useState } from 'react';
import { Building2, ChevronDown, LayoutGrid } from 'lucide-react';

export const PropertySwitcher = ({ properties = [], activeId, allLabel = '전체 보기', onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const active = properties.find((p) => p.id === activeId);
  const label = active ? active.label : allLabel;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-input border border-line bg-surface px-3 py-2 text-body font-medium text-ink transition-colors hover:border-accent/40"
      >
        <Building2 size={16} className="text-ink-3" />
        <span className="max-w-44 truncate">{label}</span>
        <ChevronDown size={14} className={`text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-10 w-64 overflow-hidden rounded-btn border border-line bg-surface py-1">
          <button
            type="button"
            onClick={() => {
              onChange?.(null);
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-body ${
              !activeId ? 'bg-accent-soft font-semibold text-accent-strong' : 'text-ink-2 hover:bg-surface-2'
            }`}
          >
            <LayoutGrid size={15} />
            {allLabel}
          </button>
          <div className="my-1 border-t border-line" />
          {properties.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange?.(p.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-body ${
                p.id === activeId ? 'bg-accent-soft font-semibold text-accent-strong' : 'text-ink-2 hover:bg-surface-2'
              }`}
            >
              <Building2 size={15} />
              <span className="min-w-0 flex-1 truncate">{p.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
