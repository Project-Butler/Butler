import backIcon from './assets/icon-back.svg';

// 글자는 Figma 단계: 제목 card(16/1.5) · 단계 num/sub(12.5/1.3 Medium).
// 모바일 상단 바 (Figma TopBar, 뒤로 가기형 — M02 회원가입·M04 부동산 등록·M06~M08): 왼쪽 뒤로 가기 44px(아이콘 22px) + 제목(card), 오른쪽 단계(1 / 2) 또는 action.
// 높이 56, 왼쪽 4px · 오른쪽 12px 여백, 아래 선은 line. step·action 을 주지 않으면 오른쪽은 비운다.
// action: 오른쪽에 둘 요소(더보기·필터 아이콘 버튼 등). step 과 함께 주면 action 이 먼저 나온다.
// titleNote: 제목 옆 작은 회색 글(대화 상대의 역할 '임차인' 등). subtitle: 제목 아래 둘째 줄(대화 제목 등).
// onSubtitleClick 을 주면 둘째 줄이 버튼(오른쪽 꺾쇠)이 된다. 주지 않으면 지금 한 줄 제목 그대로.
const SubtitleChevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const TitleBlock = ({ title, titleNote, subtitle, onSubtitleClick }) => {
  if (!subtitle && !titleNote) return <h1 className="truncate text-m-card font-semibold text-ink">{title}</h1>;
  return (
    <div className="min-w-0">
      <h1 className="truncate text-m-card font-semibold leading-tight text-ink">
        {title}
        {titleNote && (
          <>
            {' '}
            <span className="text-m-sub font-normal text-ink-3">{titleNote}</span>
          </>
        )}
      </h1>
      {subtitle &&
        (onSubtitleClick ? (
          <button type="button" onClick={onSubtitleClick} className="flex max-w-full items-center gap-0.5 text-m-sub text-accent-strong">
            <span className="truncate">{subtitle}</span>
            <SubtitleChevron />
          </button>
        ) : (
          <p className="truncate text-m-sub text-ink-3">{subtitle}</p>
        ))}
    </div>
  );
};

export const BackTopBar = ({ title, titleNote, subtitle, onSubtitleClick, step, action, onBack, backLabel = '뒤로 가기' }) => (
  <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b border-line bg-surface pl-1 pr-3">
    <div className="flex min-w-0 items-center gap-0.5">
      <button type="button" aria-label={backLabel} onClick={onBack} className="flex h-11 w-11 shrink-0 items-center justify-center">
        <img src={backIcon} alt="" width={22} height={22} />
      </button>
      <TitleBlock title={title} titleNote={titleNote} subtitle={subtitle} onSubtitleClick={onSubtitleClick} />
    </div>
    {(action || step) && (
      <div className="flex shrink-0 items-center gap-2">
        {action}
        {step && <p className="font-num text-num-sub font-medium text-ink-3">{step}</p>}
      </div>
    )}
  </header>
);
