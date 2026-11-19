import logoMark from './assets/logo-mark.svg';

// 모바일 상단 바 (Figma TopBar, 홈형): 왼쪽 로고 마크 24px + 브랜드(card), 오른쪽 아바타 32px. 위아래 10px · 양옆 20px, 아래 선은 line.
// avatar: { name, label, onClick } — 이름의 첫 글자를 보여 주는 원형 버튼. 주지 않으면 버튼을 두지 않는다.
// notification: { count, onClick } — 아바타 왼쪽 종 버튼. count(안 읽은 수)가 1 이상이면 빨간 숫자를 붙인다(99개 넘으면 99+). 주지 않으면 두지 않는다.
// search: { onClick } — 종 왼쪽 검색 버튼(통합 검색 M13, #172). 주지 않으면 두지 않는다.
// 뒤로 가기가 있는 변형은 BackTopBar 를 쓴다.
const SearchIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const BellIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

const NotificationButton = ({ count = 0, onClick }) => {
  const label = count > 0 ? `알림, 안 읽은 알림 ${count}개` : '알림';
  return (
    <button type="button" aria-label={label} onClick={onClick} className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-2">
      <BellIcon />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-crit px-1 text-center font-num text-[11px] font-semibold leading-[18px] text-white tabular-nums"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
};

export const TopBar = ({ brand = 'Butler', avatar, notification, search }) => (
  <header className="sticky top-0 z-10 flex min-h-[53px] items-center justify-between border-b border-line bg-surface px-5 py-2.5">
    <div className="flex items-center gap-2">
      <img src={logoMark} alt="" width={24} height={24} />
      <p className="text-m-card font-semibold text-ink">{brand}</p>
    </div>
    <div className="flex items-center gap-1.5">
      {search && (
        <button type="button" aria-label="통합 검색" onClick={search.onClick} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2">
          <SearchIcon />
        </button>
      )}
      {notification && <NotificationButton count={notification.count} onClick={notification.onClick} />}
      {avatar && (
        <button
          type="button"
          aria-label={avatar.label ?? '내 계정'}
          onClick={avatar.onClick}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-m-chip font-semibold text-accent-strong"
        >
          {avatar.name?.trim()?.[0] ?? '○'}
        </button>
      )}
    </div>
  </header>
);
