import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { MobileShell } from '@butler/ui';
import { AccountCard } from '../../shared/AccountCard';
import { ComingSoon } from '../../shared/ComingSoon';
import { HOME_PATH } from '../web/routes';
import { HomePage } from './pages/HomePage';
import { PropertyRegisterPage } from './pages/PropertyRegisterPage';
import { isTabActive, SETTINGS_PATH, TABS } from './tabs';

// 탭이 있는 앱 화면(상단 바 + 하단 탭). 앱 화면이 아직 없는 주소는 모두 앱 셸 안의 "준비 중"이다.
// 상단 바 아바타의 이름은 '내 계정'이다(하단 탭 '내 정보'와 같은 이름의 버튼이 둘 생기지 않게).
const TabScreens = ({ user, onLogout, onUnauthorized }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const tabs = TABS.map((tab) => ({ ...tab, active: isTabActive(tab, pathname), onClick: () => navigate(tab.path) }));
  const current = TABS.find((tab) => isTabActive(tab, pathname));

  return (
    <MobileShell shell="landlord-app" topBar={{ avatar: { name: user.name, label: '내 계정', onClick: () => navigate(SETTINGS_PATH) } }} tabs={tabs}>
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

// 임대인 앱 화면. 이 컴포넌트는 앱의 /landlord/* 아래에 놓인다(주소는 웹과 같고 화면만 다르다).
// 홈(M03)은 탭 화면 안에, 부동산 등록(M04)처럼 하단 탭이 없는 입력 화면은 탭 화면 밖에 놓는다.
// 로그인·세션은 앱 최상위가 하고, 여기는 user·onLogout·onUnauthorized 를 props 로 받는다.
export const LandlordAppRoutes = ({ user, onLogout, onUnauthorized }) => (
  <Routes>
    <Route path="/properties/new" element={<PropertyRegisterPage onUnauthorized={onUnauthorized} />} />
    <Route path="*" element={<TabScreens user={user} onLogout={onLogout} onUnauthorized={onUnauthorized} />} />
  </Routes>
);
