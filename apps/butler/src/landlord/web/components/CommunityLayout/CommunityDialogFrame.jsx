import { createPortal } from 'react-dom';
import { useCommunitySurface } from './CommunitySurface';

// 커뮤니티 대화상자의 바깥 틀(신고 · 닉네임 · 앱의 건물 바꾸기). 안의 제목 · 문구 · 버튼은 각 대화상자가 그리고, 여기는 덮개와 창만.
// 웹: 어두운 덮개 + 가운데 카드(max-w-md) — 신고 · 닉네임 대화상자가 원래 그리던 모양 그대로.
// 앱: 컨텍스트의 Sheet(아래에서 올라오는 시트, 앱 틀이 넘긴다)에 같은 props 를 넘긴다 — 안의 문구는 PC 와 같다.
// document.body 에 그린다(portal) — 화면 틀(CommunityFrame)의 간격 클래스(space-y)가 덮개에 위 여백을 주지 않게.
// as: 창 요소('div' | 'form') · dialogRef: 포커스 가둠용 · labelledBy · describedBy: 제목 · 설명 id · onSubmit: form 일 때
export const CommunityDialogFrame = ({ as: Element = 'div', dialogRef, labelledBy, describedBy, onClose, onSubmit, children }) => {
  const { Sheet } = useCommunitySurface();
  if (Sheet) {
    return (
      <Sheet as={Element} dialogRef={dialogRef} labelledBy={labelledBy} describedBy={describedBy} onClose={onClose} onSubmit={onSubmit}>
        {children}
      </Sheet>
    );
  }
  return createPortal(
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6" onClick={onClose}>
      <Element
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className="flex w-full max-w-md flex-col gap-4 rounded-card bg-surface p-6"
        onClick={(event) => event.stopPropagation()}
        onSubmit={onSubmit}
      >
        {children}
      </Element>
    </div>,
    document.body,
  );
};
