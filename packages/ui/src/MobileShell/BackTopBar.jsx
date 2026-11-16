import backIcon from './assets/icon-back.svg';

// 글자는 Figma 단계: 제목 card(16/1.5) · 단계 num/sub(12.5/1.3 Medium).
// 모바일 상단 바 (Figma TopBar, 뒤로 가기형 — M02 회원가입·M04 부동산 등록·M06~M08): 왼쪽 뒤로 가기 44px(아이콘 22px) + 제목(card), 오른쪽 단계(1 / 2) 또는 action.
// 높이 56, 왼쪽 4px · 오른쪽 12px 여백, 아래 선은 line. step·action 을 주지 않으면 오른쪽은 비운다.
// action: 오른쪽에 둘 요소(더보기·필터 아이콘 버튼 등). step 과 함께 주면 action 이 먼저 나온다.
export const BackTopBar = ({ title, step, action, onBack, backLabel = '뒤로 가기' }) => (
  <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b border-line bg-surface pl-1 pr-3">
    <div className="flex min-w-0 items-center gap-0.5">
      <button type="button" aria-label={backLabel} onClick={onBack} className="flex h-11 w-11 shrink-0 items-center justify-center">
        <img src={backIcon} alt="" width={22} height={22} />
      </button>
      <h1 className="truncate text-m-card font-semibold text-ink">{title}</h1>
    </div>
    {(action || step) && (
      <div className="flex shrink-0 items-center gap-2">
        {action}
        {step && <p className="font-num text-num-sub font-medium text-ink-3">{step}</p>}
      </div>
    )}
  </header>
);
