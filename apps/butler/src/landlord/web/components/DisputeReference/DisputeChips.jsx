// 분쟁 화면의 알약 칩(자주 묻는 질문 · 자료 찾기 상황). 공용 FilterChip은 휴대폰에서 44px로 커져 화면마다 칩 크기가 달라져서 따로 둔다.
// 웹은 칩을 줄바꿈해 다 보이게(카카오 고객센터 추천 키워드처럼 넘기기 없이), 앱은 폭이 좁아 여러 줄이 되므로
// A팀 하우스 로그 유형 칩처럼 화면 끝까지 닿는 가로 스크롤 한 줄.
const APP_SCROLL_LINE = '-mx-5 flex w-[calc(100%+2.5rem)] gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export const DisputeChip = ({ selected, onClick, children }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={`min-h-9 whitespace-nowrap rounded-full border px-3 text-sub transition-colors ${
      selected ? 'border-accent bg-accent-soft font-semibold text-accent-strong' : 'border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink'
    }`}
  >
    {children}
  </button>
);

// 고르는 칩 한 줄(자료 찾기 상황).
export const ChipLine = ({ isApp, ariaLabel, children }) => (
  <div role="group" aria-label={ariaLabel} className={isApp ? APP_SCROLL_LINE : 'flex flex-wrap gap-2'}>
    {children}
  </div>
);

// '자주 묻는 질문' 라벨 + 칩 줄(첫 화면·상황 안내). 웹은 라벨 · 칩 · after(전체 보기 등)를 한 줄에 감고,
// 앱은 라벨 줄을 위에 따로 두고 after는 그 줄 오른쪽 끝(A팀 일정 목록 머리처럼).
export const QuestionChipRow = ({ isApp, after, children }) => {
  if (isApp) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-m-label font-semibold text-ink-3">자주 묻는 질문</span>
          {after}
        </div>
        <ul className={APP_SCROLL_LINE}>{children}</ul>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sub font-semibold text-ink-3">자주 묻는 질문</span>
      <ul className="contents">{children}</ul>
      {after}
    </div>
  );
};
