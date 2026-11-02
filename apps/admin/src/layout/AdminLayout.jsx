import { AppShell } from '@butler/ui';
import { Building, Building2, FileSignature, FolderOpen, History, LayoutDashboard, ListChecks, Settings, Users, Wrench } from 'lucide-react';

// 운영 API가 아직 없는 메뉴는 badge '준비 중'을 달고, 누르면 App이 '준비 중' 화면을 보여 준다.
const COMING_SOON = '준비 중';

export const NAV_ITEMS = [
  { key: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { key: 'users', label: '회원', icon: Users },
  { key: 'ownerships', label: '소유 관계', icon: Building2 },
  { key: 'complexes', label: '단지 등록', icon: Building },
  { key: 'jobs', label: '작업', icon: ListChecks },
  { key: 'auditLogs', label: '감사 로그', icon: History },
  { key: 'contracts', label: '계약', icon: FileSignature },
  { key: 'tickets', label: '유지보수', icon: Wrench, badge: COMING_SOON },
  { key: 'documents', label: '문서', icon: FolderOpen, badge: COMING_SOON },
];

export const SETTINGS_ITEM = { key: 'settings', label: '설정', icon: Settings };

// 선택된 메뉴(activeKey)와 화면 이동(onNavigate)은 App이 URL(react-router)에서 구해 넘긴다.
export const AdminLayout = ({ children, user, onLogout, activeKey, onNavigate }) => {
  const active = [...NAV_ITEMS, SETTINGS_ITEM].find((item) => item.key === activeKey);

  return (
    <AppShell
      brand="Butler Admin"
      brandSubtitle="관리자 콘솔"
      breadcrumb={['관리자 콘솔', active?.label].filter(Boolean)}
      user={{ name: user?.name, role: '운영자', onLogout }}
      nav={NAV_ITEMS.map((item) => ({
        ...item,
        active: item.key === activeKey,
        onClick: () => onNavigate(item.key),
      }))}
      settingsItem={{
        label: SETTINGS_ITEM.label,
        icon: SETTINGS_ITEM.icon,
        active: activeKey === SETTINGS_ITEM.key,
        onClick: () => onNavigate(SETTINGS_ITEM.key),
      }}
    >
      {children}
    </AppShell>
  );
};
