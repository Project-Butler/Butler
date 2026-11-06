import logoMark from './assets/logo-mark.svg';

// 모바일 상단 바 (Figma TopBar, 홈형): 왼쪽 로고 마크 24px + 브랜드(card), 오른쪽 아바타 32px. 위아래 10px · 양옆 20px, 아래 선은 line.
// avatar: { name, label, onClick } — 이름의 첫 글자를 보여 주는 원형 버튼. 주지 않으면 버튼을 두지 않는다.
// 검색·알림·뒤로 가기가 있는 변형은 해당 화면(#98)에서 필요할 때 더한다.
export const TopBar = ({ brand = 'Butler', avatar }) => (
  <header className="sticky top-0 z-10 flex min-h-[53px] items-center justify-between border-b border-line bg-surface px-5 py-2.5">
    <div className="flex items-center gap-2">
      <img src={logoMark} alt="" width={24} height={24} />
      <p className="text-card font-semibold text-ink">{brand}</p>
    </div>
    {avatar && (
      <button
        type="button"
        aria-label={avatar.label ?? '내 계정'}
        onClick={avatar.onClick}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-chip font-semibold text-accent-strong"
      >
        {avatar.name?.trim()?.[0] ?? '○'}
      </button>
    )}
  </header>
);
