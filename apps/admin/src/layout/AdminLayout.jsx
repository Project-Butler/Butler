import { AppShell } from '@butler/ui';
import { Building2, FileSignature, FolderOpen, History, LayoutDashboard, ListChecks, Settings, Users, Wrench } from 'lucide-react';

export const NAV_ITEMS = [
  { key: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { key: 'users', label: '회원 관리', icon: Users },
  { key: 'ownerships', label: '소유 관계 관리', icon: Building2 },
  { key: 'jobs', label: '작업 관리', icon: ListChecks },
  { key: 'auditLogs', label: '감사 로그', icon: History },
  { key: 'contracts', label: '계약 관리', icon: FileSignature },
  { key: 'tickets', label: '유지보수 관리', icon: Wrench },
  { key: 'documents', label: '문서 관리', icon: FolderOpen },
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
