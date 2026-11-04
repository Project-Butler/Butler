import { useState } from 'react';
import { CheckSquare, ChevronDown, ExternalLink } from 'lucide-react';

// '직접 해결하기 전에 확인하세요' 도구 목록. 바깥 도구는 새 창으로 열고, 체크리스트는 그 자리에서 펼친다.
export const SelfCheckTools = ({ tools }) => {
  const [openKey, setOpenKey] = useState(null);
  return (
    <ul className="divide-y divide-line rounded-card border border-line bg-surface">
      {tools.map((tool) => {
        const isOpen = openKey === tool.key;
        const row = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold text-ink">{tool.label}</span>
              <span className="block text-sub text-ink-3">{tool.note}</span>
            </span>
            {tool.href ? (
              <ExternalLink size={16} className="shrink-0 text-ink-3" />
            ) : (
              <ChevronDown size={16} className={`shrink-0 text-ink-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            )}
          </>
        );
        const rowClass = 'flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2';
        return (
          <li key={tool.key}>
            {tool.href ? (
              <a href={tool.href} target="_blank" rel="noreferrer" className={rowClass}>
                {row}
              </a>
            ) : (
              <>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpenKey(isOpen ? null : tool.key)} className={rowClass}>
                  {row}
                </button>
                {isOpen && (
                  <ul className="flex flex-col gap-1.5 px-4 pb-4">
                    {tool.items.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-body text-ink">
                        <CheckSquare size={16} className="shrink-0 text-accent" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
};
