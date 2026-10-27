import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { TYPE_LABELS } from '../../utils/disputeReference';

// 자주 묻는 질문 아코디언. 첫 질문은 펼쳐 둔다. 답 아래 근거 자료를 누르면 사례 상세로 간다.
// 질문이 늦게 도착해도 첫 질문이 펼쳐지도록, 아직 아무것도 누르지 않은 상태(FIRST)를 따로 둔다.
const FIRST = Symbol('first');

export const FaqList = ({ faqs, onOpenReference }) => {
  const [openKey, setOpenKey] = useState(FIRST);

  return (
    <ul className="divide-y divide-line rounded-card border border-line bg-surface">
      {faqs.map((faq, index) => {
        const isOpen = openKey === FIRST ? index === 0 : faq.key === openKey;
        const panelId = `faq-${faq.key}`;
        return (
          <li key={faq.key}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpenKey(isOpen ? null : faq.key)}
              className="flex min-h-11 w-full items-start gap-3 px-4 py-3.5 text-left lg:px-5"
            >
              <span className="font-num text-card font-semibold text-accent">Q</span>
              <span className="min-w-0 flex-1 break-keep text-body font-semibold text-ink">{faq.question}</span>
              <ChevronDown
                size={18}
                className={`mt-0.5 shrink-0 text-ink-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isOpen && (
              <div id={panelId} className="px-4 pb-4 pl-11 lg:px-5 lg:pl-12">
                <p className="text-body text-ink-2">{faq.answer}</p>
                {faq.references.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {faq.references.map((reference) => (
                      <li key={reference.id}>
                        <button
                          type="button"
                          onClick={() => onOpenReference(reference.id)}
                          className="flex min-h-9 w-full items-center gap-2 rounded-input bg-surface-2 px-3 py-2 text-left transition-colors hover:bg-accent-soft"
                        >
                          <span className="shrink-0 text-chip font-semibold text-ink-3">
                            {TYPE_LABELS[reference.type] ?? '자료'}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sub text-ink">{reference.title}</span>
                          <ChevronRight size={16} className="shrink-0 text-ink-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};
