import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, MobileShell } from '@butler/ui';
import { HOME_PATH } from '../web/routes';
import { ComingSoon } from './ComingSoon';
import { isTabActive, SETTINGS_PATH, TABS } from './tabs';

// 임대인 앱 화면(상단 바 + 하단 탭). 이 컴포넌트는 앱의 /landlord/* 아래에 놓인다(주소는 웹과 같고 화면만 다르다).
// 앱 화면이 아직 없는 주소는 모두 앱 셸 안의 "준비 중"이다. 홈(M03) 등 실제 화면은 #98 에서 만든다.
// 상단 바 아바타의 이름은 '내 계정'이다(하단 탭 '내 정보'와 같은 이름의 버튼이 둘 생기지 않게).
// 로그인·세션은 앱 최상위가 하고, 여기는 user·onLogout 을 props 로 받는다.
export const LandlordAppRoutes = ({ user, onLogout }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const tabs = TABS.map((tab) => ({ ...tab, active: isTabActive(tab, pathname), onClick: () => navigate(tab.path) }));
  const current = TABS.find((tab) => isTabActive(tab, pathname));

  return (
    <MobileShell shell="landlord-app" topBar={{ avatar: { name: user.name, label: '내 계정', onClick: () => navigate(SETTINGS_PATH) } }} tabs={tabs}>
      <Routes>
        <Route path="/" element={<Navigate to={HOME_PATH} replace />} />
        <Route
          path="/settings"
          element={
            <ComingSoon title="내 정보">
              <Card>
                <p className="text-card-sm font-semibold text-ink">{user.name}</p>
                <p className="text-sub text-ink-3">{user.email}</p>
                <Button variant="secondary" className="mt-4 w-full" onClick={onLogout}>
                  로그아웃
                </Button>
              </Card>
            </ComingSoon>
          }
        />
        <Route path="*" element={<ComingSoon title={current?.label ?? '준비 중인 화면'} />} />
      </Routes>
    </MobileShell>
  );
};
