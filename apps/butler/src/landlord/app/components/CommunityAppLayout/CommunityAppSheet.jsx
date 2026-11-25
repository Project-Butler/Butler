import { createPortal } from 'react-dom';

// 커뮤니티 대화상자(신고 · 닉네임 · 건물 바꾸기)의 앱 틀 — 아래에서 올라오는 시트. web CommunityDialogFrame 이 컨텍스트로 받아 쓴다.
// 모양은 앱 BottomSheet(components/BottomSheet)와 같다: 어두운 덮개 + 위 모서리만 둥근 흰 판, 모바일 폭(430px), 높이 85% 까지 · 넘치면 스크롤.
// 제목 · 닫기 · 문구 · 버튼은 웹 대화상자가 그대로 그린다(PC 와 같은 문구) — 그래서 BottomSheet 의 제목 줄은 쓰지 않고 판만 같게 했다.
// 바깥(덮개)을 누르면 onClose. document.body 에 그린다 — 화면 틀의 간격 클래스가 덮개에 붙지 않게.
// 시트 안의 버튼(사유 칩 · 취소 · 신고하기 · 저장 · 건물 줄)과 입력칸(닉네임 — TextField 의 input)은 휴대폰에서 누르기 좋게 높이 44px 이상
// ([&_button]:min-h-11 · [&_.rounded-input>input]:min-h-11) — 글자 · 순서는 그대로
// (이 틀은 앱에서만 쓰이므로 PC 대화상자는 그대로다)
export const CommunityAppSheet = ({ as: Element = 'div', dialogRef, labelledBy, describedBy, onClose, onSubmit, children }) =>
  createPortal(
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40" onClick={onClose}>
      <Element
        ref={dialogRef}
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
