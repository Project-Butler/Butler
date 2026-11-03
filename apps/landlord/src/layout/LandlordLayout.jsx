import { AppShell } from '@butler/ui';
import { Building2, ClipboardList, FileSignature, FolderOpen, Home, Scale, Settings, Users, Wrench } from 'lucide-react';

const NAV_ITEMS = [
  { key: 'home', label: '홈', icon: Home },
  { key: 'buildingList', label: '내 부동산', icon: Building2 },
  { key: 'leases', label: '계약', icon: FileSignature },
  { key: 'tickets', label: '유지보수 요청', icon: Wrench },
  { key: 'log', label: '관리 로그', icon: ClipboardList },
  { key: 'documents', label: '문서', icon: FolderOpen },
  { key: 'community', label: '커뮤니티', icon: Users },
  { key: 'disputes', label: '임대차 분쟁', icon: Scale },
];

const SETTINGS_ITEM = { key: 'settings', label: '설정', icon: Settings };

// 선택된 메뉴(activeKey)와 화면 이동(onNavigate)은 App이 URL(react-router)에서 구해 넘긴다.
// subTitle은 하위 화면(상세·등록)일 때 breadcrumb 끝에 붙는다.
// navBadges: 메뉴 key → 오른쪽 끝 숫자(예: { leases: 만료 임박 계약 수 }). 0이나 값이 없으면 숨긴다.
export const LandlordLayout = ({ children, user, onLogout, activeKey, onNavigate, subTitle, navBadges = {} }) => {
  const active = [...NAV_ITEMS, SETTINGS_ITEM].find((item) => item.key === activeKey);
  const breadcrumb = ['버틀러의 자산', active?.label, subTitle].filter(Boolean);

  return (
    <AppShell
      brand="Butler"
      brandSubtitle="버틀러의 자산"
      breadcrumb={breadcrumb}
      notificationCount={2}
      user={{ name: `${user?.name}님`, role: '임대인', onLogout }}
      nav={NAV_ITEMS.map((item) => ({
        ...item,
        badge: navBadges[item.key] > 0 ? navBadges[item.key] : undefined,
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
