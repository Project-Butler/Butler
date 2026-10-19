import { Bell, ChevronRight, Home, Search } from 'lucide-react';
import { Button } from '../Button/Button';
import { PropertySwitcher } from '../PropertySwitcher/PropertySwitcher';
import { UserMenu } from '../UserMenu/UserMenu';

const NavItem = ({ icon: Icon, label, badge, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`group flex w-full items-center gap-2.5 rounded-btn px-3 py-2.5 text-left text-sm transition-colors ${
      active ? 'bg-accent-soft font-semibold text-accent-strong' : 'font-medium text-ink-2 hover:bg-surface-2 hover:text-ink'
    }`}
  >
    {Icon && (
      <Icon
        size={18}
        strokeWidth={2}
        className={active ? 'text-accent-strong' : 'text-ink-3 group-hover:text-ink-2'}
      />
    )}
    <span className="flex-1">{label}</span>
    {badge != null && (
      <span
        className={`rounded-full px-1.5 py-0.5 text-xs leading-none font-num ${
          active ? 'bg-white/70 text-accent-strong' : 'bg-surface-2 text-ink-3'
        }`}
      >
        {badge}
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
  user,
  primaryAction,
  children,
}) => {
  return (
    <div className="flex min-h-screen bg-ground font-sans text-ink">
      <aside className="flex w-64 flex-col border-r border-line bg-white">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-accent text-white">
            <Home size={18} strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold leading-tight text-seal-ink">{brand}</p>
            {brandSubtitle && <p className="truncate text-xs leading-tight text-ink-3">{brandSubtitle}</p>}
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 pt-2">
          {nav.map(({ key, ...item }) => (
            <NavItem key={key ?? item.label} {...item} />
          ))}
        </nav>

        {settingsItem && (
          <div className="border-t border-line px-3 py-3">
            <NavItem {...settingsItem} />
          </div>
        )}
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-line bg-white px-6">
          <div className="flex min-w-0 items-center gap-1 text-sm text-ink-3">
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
                className="flex w-64 items-center gap-2 rounded-input border border-line bg-surface-2 px-3 py-2 text-sm text-ink-3 transition-colors hover:border-accent/40"
              >
                <Search size={16} className="text-ink-3" />
                <span className="flex-1 truncate text-left">{searchPlaceholder}</span>
                <span className="rounded border border-line bg-white px-1.5 py-0.5 font-num text-xs text-ink-3">
                  Ctrl K
                </span>
              </button>
            )}

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
