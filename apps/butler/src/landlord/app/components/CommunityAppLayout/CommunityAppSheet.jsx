import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBottomSheet } from '../BottomSheet/BottomSheet';

// 커뮤니티 대화상자(신고 · 닉네임 · 건물 바꾸기)의 앱 틀 — 아래에서 올라오는 시트. web CommunityDialogFrame 이 컨텍스트로 받아 쓴다.
// 모양 · 움직임은 앱 BottomSheet(components/BottomSheet)와 같다: 어두운 덮개 + 위 모서리만 둥근 흰 판, 모바일 폭(430px), 높이 85% 까지 · 넘치면 스크롤,
// 열릴 때 아래에서 올라오고 닫힐 때 내려간다. 닫기는 BottomSheet 의 useBottomSheet 그대로 — 대화상자가 X · [취소] · Esc · 저장 성공 뒤에
// sheet.close(다음 동작)를 부르고(CommunityDialogFrame useCommunityDialogSheet), 내려간 뒤 다음 동작(시트를 없애는 부모 함수)이 불린다.
// 제목 · 닫기 · 문구 · 버튼은 웹 대화상자가 그대로 그린다(PC 와 같은 문구) — 그래서 BottomSheet 의 제목 줄은 쓰지 않고 판 · 움직임만 같게 했다.
// 바깥(덮개)을 누르면 내려간 뒤 onClose, closeDisabled 면(저장 중) 닫지 않는다. document.body 에 그린다 — 화면 틀의 간격 클래스가 덮개에 붙지 않게.
// 시트 안의 버튼(사유 칩 · 취소 · 신고하기 · 저장 · 건물 줄)과 입력칸(닉네임 — TextField 의 input)은 휴대폰에서 누르기 좋게 높이 44px 이상
// ([&_button]:min-h-11 · [&_.rounded-input>input]:min-h-11) — 글자 · 순서는 그대로
// (이 틀은 앱에서만 쓰이므로 PC 대화상자는 그대로다)

// 열림 움직임 — BottomSheet 와 같은 값(그 파일은 앱 공용 틀이라 고치지 않고, 열림 움직임만 같은 값으로 따라 한다)
const OPEN_MS = 450;
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const canAnimate = (element) => typeof element?.animate === 'function' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const CommunityAppSheet = ({
  as: Element = 'div',
  dialogRef,
  labelledBy,
  describedBy,
  onClose,
  onSubmit,
  sheet,
  closeDisabled = false,
  children,
}) => {
  const ownSheet = useBottomSheet();
  const { overlayRef, panelRef, close } = sheet ?? ownSheet;

  useEffect(() => {
    const panel = panelRef.current;
    if (!canAnimate(panel)) return;
    overlayRef.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: EASE_OUT });
    panel.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: OPEN_MS, easing: EASE_OUT });
  }, [overlayRef, panelRef]);

  // 판 하나를 두 ref 가 본다 — 움직임(panelRef)과 대화상자의 포커스 가둠(dialogRef)
  const setPanel = useCallback(
    (node) => {
      panelRef.current = node;
      if (dialogRef) dialogRef.current = node;
    },
    [panelRef, dialogRef],
  );

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40"
      onClick={() => {
        if (!closeDisabled) close(onClose);
      }}
    >
      <Element
        ref={setPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className="flex max-h-[85vh] w-full max-w-[430px] flex-col gap-4 overflow-y-auto rounded-t-card bg-surface px-5 pb-7 pt-5 break-keep break-words [&_.rounded-input>input]:min-h-11 [&_button]:min-h-11"
        onClick={(event) => event.stopPropagation()}
        onSubmit={onSubmit}
      >
        {children}
      </Element>
    </div>,
    document.body,
  );
};
