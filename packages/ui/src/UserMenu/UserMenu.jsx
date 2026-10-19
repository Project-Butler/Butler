import { LogOut, User } from 'lucide-react';

export const UserMenu = ({ name, role, onLogout }) => {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label="사용자 메뉴"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-seal-soft text-seal-ink transition-colors group-hover:bg-seal/20"
      >
        <User size={18} />
      </button>

      <div className="invisible absolute right-0 top-full z-10 pt-2 opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100">
        <div className="w-44 overflow-hidden rounded-btn border border-line bg-surface">
          {(name || role) && (
            <div className="border-b border-line px-3 py-2">
              {name && <p className="truncate text-body font-semibold text-ink">{name}</p>}
              {role && <p className="truncate text-chip text-ink-3">{role}</p>}
            </div>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-body text-crit-ink transition-colors hover:bg-crit-soft"
          >
            <LogOut size={15} />
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
};
