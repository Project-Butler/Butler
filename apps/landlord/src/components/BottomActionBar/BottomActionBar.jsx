// 화면 하단 고정 버튼 영역(design.md §6 부동산 등록 "하단 고정 버튼").
// PC 기준: AppShell 사이드바(w-64) 오른쪽 본문 폭에 맞춘다. 쓰는 페이지는 가려지지 않도록 아래 여백(pb-40)을 둔다.
// left-64는 AppShell 사이드바 폭(w-64)과 맞물려 있다 — 사이드바 폭을 바꾸면 함께 고친다.
export const BottomActionBar = ({ children }) => (
  <div className="fixed bottom-0 left-64 right-0 z-10 border-t border-line bg-surface px-6 py-4">
    <div className="mx-auto max-w-2xl">{children}</div>
  </div>
);
