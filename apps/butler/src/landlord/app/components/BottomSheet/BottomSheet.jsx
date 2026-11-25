// Created: 2026-11-25 22:57
import { useCallback, useEffect, useRef } from 'react';

const OPEN_MS = 450;
const CLOSE_MS = 160;
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';

// 애니메이션을 쓸 수 있는지. 기기의 '동작 줄이기'가 켜져 있거나 Web Animations API가 없으면(테스트 환경 등) 움직이지 않는다.
// Tailwind 설정에 keyframes를 더하지 않으려고 element.animate 를 쓴다(MarqueeText 와 같다).
const canAnimate = (element) => {
  if (typeof element?.animate !== 'function') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
};

// 시트 닫기 제어. 시트를 그리는 컴포넌트가 만들어 <BottomSheet sheet={sheet}> 로 넘기고,
// [취소]·저장 성공 등 닫는 곳에서 sheet.close(다음 동작)를 부른다. 내려가는 애니메이션이 끝나면 다음 동작(시트를 화면에서 없애는 부모 함수)을 부른다.
// 다음 동작은 꼭 시트를 닫아야 한다(애니메이션이 끝난 시트는 보이지 않는 채로 남는다). 움직일 수 없으면 바로 부른다.
export const useBottomSheet = () => {
  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  const closingRef = useRef(false);

  const close = useCallback((after) => {
    if (closingRef.current) return;
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!canAnimate(panel)) {
      after?.();
      return;
    }
    closingRef.current = true;
    overlay.style.pointerEvents = 'none';
    const options = { duration: CLOSE_MS, easing: EASE_IN, fill: 'forwards' };
    overlay.animate([{ opacity: 1 }, { opacity: 0 }], options);
    panel.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }], options).finished.then(
      () => after?.(),
      () => after?.(),
    );
  }, []);

  return { overlayRef, panelRef, close };
};

// 아래에서 올라오는 시트(완료 처리·취소 확인·문서 올리기 등). 열릴 때 아래에서 올라오고 배경이 어두워진다.
// 바깥을 누르면 내려가는 애니메이션 뒤 onClose. closeDisabled 면(저장 중 등) 바깥을 눌러도 닫지 않는다.
// sheet: useBottomSheet() 결과. [취소]·저장 성공 뒤에도 내려가며 닫히게 하려면 넘긴다. 없으면 시트가 따로 만든다(바깥 누르기만 애니메이션).
export const BottomSheet = ({ label, onClose, closeDisabled = false, sheet, children }) => {
  const ownSheet = useBottomSheet();
  const { overlayRef, panelRef, close } = sheet ?? ownSheet;

  useEffect(() => {
    const panel = panelRef.current;
    if (!canAnimate(panel)) return;
    overlayRef.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: EASE_OUT });
    panel.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: OPEN_MS, easing: EASE_OUT });
  }, [overlayRef, panelRef]);

  const handleBackdrop = () => {
    if (!closeDisabled) close(onClose);
  };

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40"
      onClick={handleBackdrop}
    >
      <div
        ref={panelRef}
        className="flex max-h-[85vh] w-full max-w-[430px] flex-col gap-4 overflow-y-auto rounded-t-card bg-surface px-5 pb-7 pt-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-m-card font-semibold text-ink">{label}</h2>
        {children}
      </div>
    </div>
  );
};
