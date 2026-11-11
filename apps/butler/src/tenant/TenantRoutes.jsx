import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { MobileShell } from '@butler/ui';
import { AccountCard } from '../shared/AccountCard';
import { ComingSoon } from '../shared/ComingSoon';
import { ContractPage } from './pages/ContractPage';
import { HomePage } from './pages/HomePage';
import { HOME_PATH, SETTINGS_PATH } from './routes';
import { isTabActive, TABS } from './tabs';

// 탭이 있는 화면(홈 · 수리 요청 · 내 정보). 수리 요청은 티켓 기능(docs/10) 전까지 준비 중 자리다.
const TabScreens = ({ user, onLogout, onUnauthorized }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tabs = TABS.map((tab) => ({ ...tab, active: isTabActive(tab, pathname), onClick: () => navigate(tab.path) }));
  const current = TABS.find((tab) => isTabActive(tab, pathname));

  return (
    <MobileShell shell="tenant" topBar={{ avatar: { name: user.name, label: '내 계정', onClick: () => navigate(SETTINGS_PATH) } }} tabs={tabs}>
      <Routes>
        <Route path="/" element={<Navigate to={HOME_PATH} replace />} />
        <Route path="/home" element={<HomePage user={user} onUnauthorized={onUnauthorized} />} />
        <Route
          path="/settings"
          element={
            <ComingSoon title="내 정보">
              <AccountCard user={user} onLogout={onLogout} />
            </ComingSoon>
          }
        />
        <Route path="*" element={<ComingSoon title={current?.label ?? '준비 중인 화면'} />} />
      </Routes>
    </MobileShell>
  );
};

// 임차인 앱 화면: 항상 앱 셸(PC 에서는 가운데 모바일 폭). 하단 탭 홈 · 수리 요청 · 내 정보, 계약서 화면은 뒤로 가기 바만 있다.
// 이 컴포넌트는 앱의 /tenant/* 아래에 놓인다. 로그인·세션은 앱 최상위가 하고, 여기는 user·onLogout·onUnauthorized 를 props 로 받는다.
export const TenantRoutes = ({ user, onLogout, onUnauthorized }) => (
  <Routes>
    <Route path="/contracts/:contractId" element={<ContractPage onUnauthorized={onUnauthorized} />} />
    <Route path="*" element={<TabScreens user={user} onLogout={onLogout} onUnauthorized={onUnauthorized} />} />
  </Routes>
);
