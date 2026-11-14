import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { IconTile } from '../IconTile/IconTile';

// 가운데 팝업(권리자 인증·기록 추가·수정). 그림자 없이 선과 Surface로 면을 나눈다(design.md §4).
// - Esc · 바깥 클릭 · 닫기 버튼으로 onClose. 주소에 팝업이 묶인 화면은 onClose에서 뒤로 가면 뒤로가기로도 닫힌다.
// - 열리면 패널에 포커스를 옮겨 키보드로 바로 다룰 수 있게 한다.
// - footer: 오른쪽 아래 버튼 줄. size: md(인증 동의) · lg(기록 입력)
const SIZE_CLASS = { md: 'max-w-lg', lg: 'max-w-2xl' };

export const Modal = ({ title, subtitle, icon, iconTone = 'accent', onClose, footer, size = 'md', children }) => {
  const titleId = useId();
  const panelRef = useRef(null);
  // onClose가 렌더마다 새로 만들어져도 포커스를 다시 옮기지 않도록 최신 값만 ref로 읽는다(입력 중 포커스 뺏김 방지).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    panelRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-full w-full flex-col rounded-card border border-line bg-surface outline-none ${SIZE_CLASS[size]}`}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          {icon && <IconTile icon={icon} tone={iconTone} />}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-section font-semibold text-ink">
              {title}
            </h2>
            {subtitle && <p className="truncate text-sub text-ink-3">{subtitle}</p>}
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-input text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
};
