import { createPortal } from 'react-dom';
import { useCommunitySurface } from './CommunitySurface';

// 대화상자를 닫는 길. close(다음 동작): 웹은 바로 다음 동작을 부르고(지금과 같다), 앱은 시트가 내려가는 애니메이션이 끝난 뒤에 부른다
// (앱 BottomSheet 의 useBottomSheet — 다른 앱 시트와 같은 동작). 대화상자는 X · [취소] · Esc · 저장 성공 뒤에 onClose · onDone 을
// 직접 부르지 않고 sheet.close(onClose) 처럼 부르고, 같은 sheet 를 CommunityDialogFrame 에 넘긴다.
// 화면 형태(웹 · 앱)는 한 화면 안에서 바뀌지 않으므로 고른 훅도 바뀌지 않는다.
const CLOSE_NOW = { close: (after) => after?.() };
const useCloseNow = () => CLOSE_NOW;
export const useCommunityDialogSheet = () => {
  const useSheet = useCommunitySurface().useSheet ?? useCloseNow;
  return useSheet();
};

// 커뮤니티 대화상자의 바깥 틀(신고 · 닉네임 · 앱의 건물 바꾸기). 안의 제목 · 문구 · 버튼은 각 대화상자가 그리고, 여기는 덮개와 창만.
// 웹: 어두운 덮개 + 가운데 카드(max-w-md) — 신고 · 닉네임 대화상자가 원래 그리던 모양 그대로.
// 앱: 컨텍스트의 Sheet(아래에서 올라오는 시트, 앱 틀이 넘긴다)에 같은 props 를 넘긴다 — 안의 문구는 PC 와 같다.
// document.body 에 그린다(portal) — 화면 틀(CommunityFrame)의 간격 클래스(space-y)가 덮개에 위 여백을 주지 않게.
// as: 창 요소('div' | 'form') · dialogRef: 포커스 가둠용 · labelledBy · describedBy: 제목 · 설명 id · onSubmit: form 일 때
// sheet: useCommunityDialogSheet() 결과 · closeDisabled: 저장 중 등 바깥을 눌러도 닫지 않음 — 둘 다 앱 시트만 쓴다(웹은 지금 그대로)
export const CommunityDialogFrame = ({ as: Element = 'div', dialogRef, labelledBy, describedBy, onClose, onSubmit, sheet, closeDisabled, children }) => {
  const { Sheet } = useCommunitySurface();
  if (Sheet) {
    return (
      <Sheet
        as={Element}
        dialogRef={dialogRef}
        labelledBy={labelledBy}
        describedBy={describedBy}
        onClose={onClose}
        onSubmit={onSubmit}
        sheet={sheet}
        closeDisabled={closeDisabled}
      >
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
