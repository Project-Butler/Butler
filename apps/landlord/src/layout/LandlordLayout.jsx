import { useState } from 'react';
import { AppShell } from '@butler/ui';
import { Bot, Building2, ClipboardList, FileSignature, FolderOpen, Home, Plus, Settings, Users, Wrench } from 'lucide-react';

const NAV_ITEMS = [
  { key: 'home', label: '홈', icon: Home },
  { key: 'properties', label: '내 부동산', icon: Building2, badge: 2 },
  { key: 'leases', label: '계약', icon: FileSignature, badge: 1 },
  { key: 'tickets', label: '유지보수 요청', icon: Wrench },
  { key: 'log', label: '관리 로그', icon: ClipboardList },
  { key: 'documents', label: '문서', icon: FolderOpen },
  { key: 'community', label: '커뮤니티', icon: Users },
  { key: 'ai', label: 'AI 상담', icon: Bot },
];

const SETTINGS_ITEM = { key: 'settings', label: '설정', icon: Settings };

export const LandlordLayout = ({ children, onLogout }) => {
  const [activeKey, setActiveKey] = useState(NAV_ITEMS[0].key);
  const active = [...NAV_ITEMS, SETTINGS_ITEM].find((item) => item.key === activeKey);

  return (
    <AppShell
      brand="Butler"
      brandSubtitle="버틀러의 자산"
      breadcrumb={['버틀러의 자산', active?.label]}
      notificationCount={2}
      user={{ name: '버틀러님', role: '임대인', onLogout }}
      primaryAction={{ label: '부동산 등록', icon: Plus, onClick: () => {} }}
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
