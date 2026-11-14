import { TAB_ICONS } from './tabIcons';

// 모바일 하단 탭 (Figma TabBar/Mobile). items: [{ key, label, icon: 'home'|'building'|'users'|'user'|'wrench', active, onClick }]
// 칸마다 아이콘 22px 위 · 글자 11px(tab, 활성은 tab-on) 아래, 위 8px · 아래 18px 여백, 위쪽 선은 line.
export const TabBar = ({ items }) => (
  <nav aria-label="하단 메뉴" className="sticky bottom-0 z-10 flex items-start border-t border-line bg-surface pb-[18px] pt-2">
    {items.map(({ key, label, icon, active, onClick }) => {
      const icons = TAB_ICONS[icon];
      if (!icons) throw new Error(`TabBar: 알 수 없는 아이콘 '${icon}' (${Object.keys(TAB_ICONS).join(' · ')} 중 하나)`);
      return (
        <button key={key} type="button" aria-current={active ? 'page' : undefined} onClick={onClick} className="flex min-w-0 flex-1 flex-col items-center gap-[3px]">
          <img src={icons[active ? 'on' : 'off']} alt="" width={22} height={22} />
          <span className={`text-tab ${active ? 'font-semibold text-accent' : 'font-medium text-ink-3'}`}>{label}</span>
        </button>
      );
    })}
  </nav>
);
