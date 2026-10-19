import { useState } from 'react';
import { AppShell } from '@butler/ui';
import { Building2, FileSignature, FolderOpen, LayoutDashboard, Settings, UserPlus, Users, Wrench } from 'lucide-react';

const NAV_ITEMS = [
  { key: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { key: 'users', label: '사용자 관리', icon: Users, badge: 3 },
  { key: 'properties', label: '부동산 관리', icon: Building2 },
  { key: 'contracts', label: '계약 관리', icon: FileSignature },
  { key: 'tickets', label: '유지보수 관리', icon: Wrench },
  { key: 'documents', label: '문서 관리', icon: FolderOpen },
];

const SETTINGS_ITEM = { key: 'settings', label: '설정', icon: Settings };

export const AdminLayout = ({ children }) => {
  const [activeKey, setActiveKey] = useState(NAV_ITEMS[0].key);
  const active = [...NAV_ITEMS, SETTINGS_ITEM].find((item) => item.key === activeKey);

  return (
    <AppShell
      brand="Butler Admin"
      brandSubtitle="관리자 콘솔"
      breadcrumb={['관리자 콘솔', active?.label]}
      searchPlaceholder="회원·부동산·계약 검색"
      notificationCount={1}
      primaryAction={{ label: '사용자 추가', icon: UserPlus, onClick: () => {} }}
      nav={NAV_ITEMS.map((item) => ({
        ...item,
        active: item.key === activeKey,
        onClick: () => setActiveKey(item.key),
      }))}
      settingsItem={{
        label: SETTINGS_ITEM.label,
        icon: SETTINGS_ITEM.icon,
        active: activeKey === 'settings',
        onClick: () => setActiveKey('settings'),
      }}
    >
      {children}
    </AppShell>
  );
};
