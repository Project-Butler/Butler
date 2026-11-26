import { Bell, ChevronRight, Home, MessageCircle, Search } from 'lucide-react';
import { Button } from '../Button/Button';
import { NotificationMenu } from '../NotificationMenu/NotificationMenu';
import { PropertySwitcher } from '../PropertySwitcher/PropertySwitcher';
import { UserMenu } from '../UserMenu/UserMenu';

// 사이드바 모양. expanded=펼침, collapsed=아이콘만, auto=넓은 화면(xl)에서만 펼침.
// Tailwind 가 클래스를 찾을 수 있게 전체 문자열로 적는다.
const SIDEBAR_STYLE = {
  expanded: {
    width: 'w-64',
    brandRow: 'px-5',
    brandText: '',
    navRow: 'gap-2.5 px-3',
    label: '',
    badge: '',
    badgeDot: 'hidden',
  },
  collapsed: {
    width: 'w-[4.5rem]',
    brandRow: 'justify-center px-0',
    brandText: 'hidden',
    navRow: 'justify-center px-0',
    label: 'hidden',
    badge: 'hidden',
    badgeDot: '',
  },
  auto: {
    width: 'w-[4.5rem] xl:w-64',
    brandRow: 'justify-center px-0 xl:justify-start xl:px-5',
    brandText: 'hidden xl:block',
    navRow: 'justify-center px-0 xl:justify-start xl:gap-2.5 xl:px-3',
    label: 'hidden xl:block',
    badge: 'hidden xl:inline',
    badgeDot: 'xl:hidden',
  },
};

const NavItem = ({ icon: Icon, label, badge, active, onClick, style }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    className={`group relative flex w-full items-center rounded-btn py-2.5 text-left text-body transition-colors ${style.navRow} ${
      active ? 'bg-accent-soft font-medium text-accent-strong' : 'font-medium text-ink-2 hover:bg-surface-2 hover:text-ink'
    }`}
  >
    {Icon && (
      <Icon
        size={18}
        strokeWidth={2}
        className={active ? 'text-accent-strong' : 'text-ink-3 group-hover:text-ink-2'}
      />
    )}
    <span className={`flex-1 ${style.label}`}>{label}</span>
    {badge != null && (
      <>
        <span
          className={`rounded-full px-1.5 py-0.5 text-chip leading-none font-num ${style.badge} ${
            active ? 'bg-surface/70 text-accent-strong' : 'bg-surface-2 text-ink-3'
          }`}
        >
          {badge}
        </span>
        {/* 라벨이 접혔을 땐 숫자 대신 점으로 알린다. */}
        <span aria-hidden="true" className={`absolute right-2 top-2 h-2 w-2 rounded-full bg-accent ${style.badgeDot}`} />
      </>
    )}
  </button>
);

// 위 막대 말풍선(대화 팝업 열기). messages: { count, onClick, expanded, id } — count(안 읽은 메시지가 있는 대화 수)가 1 이상이면 빨간 숫자.
const MessagesButton = ({ count = 0, onClick, expanded, id }) => (
  <button
    type="button"
    id={id}
    aria-label={count > 0 ? `대화, 안 읽은 대화 ${count}개` : '대화'}
    aria-expanded={expanded}
    onClick={onClick}
    className={`relative flex h-9 w-9 items-center justify-center rounded-btn transition-colors hover:bg-surface-2 ${expanded ? 'bg-accent-soft text-accent-strong' : 'text-ink-2'}`}
  >
    <MessageCircle size={18} aria-hidden="true" />
    {count > 0 && (
      <span
        aria-hidden="true"
        className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-crit px-1 text-center font-num text-[11px] font-semibold leading-[18px] text-white tabular-nums"
      >
        {count > 99 ? '99+' : count}
      </span>
    )}
  </button>
);

export const AppShell = ({
  brand,
  brandSubtitle,
  nav = [],
  settingsItem,
  breadcrumb = [],
  searchPlaceholder,
  propertySwitcher,
  notificationCount,
  notifications,
  messages,
  user,
  primaryAction,
  sidebar = 'expanded',
  children,
}) => {
  const style = SIDEBAR_STYLE[sidebar] ?? SIDEBAR_STYLE.expanded;

  return (
    <div className="flex min-h-screen bg-ground font-sans text-ink">
      <aside className={`sticky top-0 flex h-screen shrink-0 flex-col self-start border-r border-line bg-surface ${style.width}`}>
        <div className={`flex items-center gap-2.5 py-5 ${style.brandRow}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-accent text-white">
            <Home size={18} strokeWidth={2.25} />
          </span>
          <div className={`min-w-0 ${style.brandText}`}>
            <p className="truncate text-card font-bold leading-tight text-seal-ink">{brand}</p>
            {brandSubtitle && <p className="truncate text-chip leading-tight text-ink-3">{brandSubtitle}</p>}
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pt-2">
          {nav.map(({ key, ...item }) => (
            <NavItem key={key ?? item.label} style={style} {...item} />
          ))}
        </nav>

        {settingsItem && (
          <div className="border-t border-line px-3 py-3">
            <NavItem style={style} {...settingsItem} />
          </div>
        )}
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-line bg-surface px-6">
          <div className="flex min-w-0 items-center gap-1 text-body text-ink-3">
            {breadcrumb.map((crumb, i) => (
              <span key={crumb} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={14} className="text-ink-3" />}
                <span className={i === breadcrumb.length - 1 ? 'font-semibold text-ink' : ''}>{crumb}</span>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {propertySwitcher && <PropertySwitcher {...propertySwitcher} />}

            {searchPlaceholder && (
              <button
                type="button"
                className="flex w-64 items-center gap-2 rounded-input border border-line bg-surface-2 px-3 py-2 text-body text-ink-3 transition-colors hover:border-accent/40"
              >
                <Search size={16} className="text-ink-3" />
                <span className="flex-1 truncate text-left">{searchPlaceholder}</span>
                <span className="rounded border border-line bg-surface px-1.5 py-0.5 font-num text-chip text-ink-3">
                  Ctrl K
                </span>
              </button>
            )}

            {messages && <MessagesButton {...messages} />}

            {notifications ? (
              <NotificationMenu {...notifications} />
            ) : (
              <button
                type="button"
                aria-label="알림"
                className="relative flex h-9 w-9 items-center justify-center rounded-btn text-ink-2 transition-colors hover:bg-surface-2"
              >
                <Bell size={18} />
                {!!notificationCount && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-crit" />
                )}
              </button>
            )}

            {primaryAction && (
              <Button variant="primary" onClick={primaryAction.onClick}>
                {primaryAction.icon && <primaryAction.icon size={16} className="mr-1.5 -ml-0.5 inline-block" />}
                {primaryAction.label}
              </Button>
            )}

            {user && <UserMenu {...user} />}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
};
