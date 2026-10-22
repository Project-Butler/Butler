import { AppShell } from '@butler/ui';
import { Bot, Building2, ClipboardList, FileSignature, FolderOpen, Home, Plus, Settings, Users, Wrench } from 'lucide-react';

const NAV_ITEMS = [
  { key: 'home', label: '홈', icon: Home },
  { key: 'buildingList', label: '내 부동산', icon: Building2 },
  { key: 'leases', label: '계약', icon: FileSignature, badge: 1 },
  { key: 'tickets', label: '유지보수 요청', icon: Wrench },
  { key: 'log', label: '관리 로그', icon: ClipboardList },
  { key: 'documents', label: '문서', icon: FolderOpen },
  { key: 'community', label: '커뮤니티', icon: Users },
  { key: 'ai', label: 'AI 상담', icon: Bot },
];

const SETTINGS_ITEM = { key: 'settings', label: '설정', icon: Settings };

// 선택된 메뉴(activeKey)와 화면 이동(onNavigate)은 App의 view 상태가 가진다.
// subTitle은 하위 화면(상세·등록)일 때 breadcrumb 끝에 붙는다.
export const LandlordLayout = ({ children, user, onLogout, activeKey, onNavigate, subTitle }) => {
  const active = [...NAV_ITEMS, SETTINGS_ITEM].find((item) => item.key === activeKey);
  const breadcrumb = ['버틀러의 자산', active?.label, subTitle].filter(Boolean);

  return (
    <AppShell
      brand="Butler"
      brandSubtitle="버틀러의 자산"
      breadcrumb={breadcrumb}
      notificationCount={2}
      user={{ name: `${user?.name}님`, role: '임대인', onLogout }}
      primaryAction={{ label: '부동산 등록', icon: Plus, onClick: () => onNavigate('propertyRegister') }}
      nav={NAV_ITEMS.map((item) => ({
        ...item,
        active: item.key === activeKey,
        onClick: () => onNavigate(item.key),
      }))}
      settingsItem={{
        label: SETTINGS_ITEM.label,
        icon: SETTINGS_ITEM.icon,
        active: activeKey === 'settings',
        onClick: () => onNavigate('settings'),
      }}
    >
      {children}
    </AppShell>
  );
};
