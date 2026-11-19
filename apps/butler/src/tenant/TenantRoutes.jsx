import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { MobileShell } from '@butler/ui';
import { AccountCard } from '../shared/AccountCard';
import { ComingSoon } from '../shared/ComingSoon';
import { SearchPage } from '../shared/search/SearchPage';
import { ContractPage } from './pages/ContractPage';
import { HomePage } from './pages/HomePage';
import { contractPath, HOME_PATH, SEARCH_PATH, SETTINGS_PATH, TICKETS_PATH } from './routes';
import { isTabActive, TABS } from './tabs';

// 탭이 있는 화면(홈 · 수리 요청 · 내 정보). 수리 요청은 티켓 기능(docs/10) 전까지 준비 중 자리다.
const TabScreens = ({ user, onLogout, onUnauthorized }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tabs = TABS.map((tab) => ({ ...tab, active: isTabActive(tab, pathname), onClick: () => navigate(tab.path) }));
  const current = TABS.find((tab) => isTabActive(tab, pathname));

  return (
    <MobileShell shell="tenant" topBar={{
        search: { onClick: () => navigate(SEARCH_PATH) },
        avatar: { name: user.name, label: '내 계정', onClick: () => navigate(SETTINGS_PATH) },
      }} tabs={tabs}>
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

// 통합 검색(M13, #172) 결과를 누르면 갈 주소. 임차인 앱에는 계약서 화면과 수리 요청 탭만 있어 그리로 보낸다.
const toTenantPath = (sectionKey, item) => {
  switch (sectionKey) {
    case 'properties':
      return item.currentContract ? contractPath(item.currentContract.id) : HOME_PATH;
    case 'documents':
      return item.resourceType === 'CONTRACT' ? contractPath(item.resourceId) : TICKETS_PATH;
    case 'schedules':
      return item.related?.resourceType === 'CONTRACT' ? contractPath(item.related.resourceId) : HOME_PATH;
    case 'tickets':
      return TICKETS_PATH;
    default:
      return HOME_PATH;
  }
};

const SearchRoute = ({ user, onUnauthorized }) => {
  const navigate = useNavigate();
  const location = useLocation();
  // 주소로 바로 들어와 이전 화면이 없으면 홈으로
  const goBack = () => (location.key === 'default' ? navigate(HOME_PATH, { replace: true }) : navigate(-1));
  return (
    <SearchPage
      userId={user.id}
      shell="tenant"
      onBack={goBack}
      onOpen={(sectionKey, item) => navigate(toTenantPath(sectionKey, item))}
      onUnauthorized={onUnauthorized}
    />
  );
};

// 임차인 앱 화면: 항상 앱 셸(PC 에서는 가운데 모바일 폭). 하단 탭 홈 · 수리 요청 · 내 정보, 계약서 화면은 뒤로 가기 바만 있다.
// 이 컴포넌트는 앱의 /tenant/* 아래에 놓인다. 로그인·세션은 앱 최상위가 하고, 여기는 user·onLogout·onUnauthorized 를 props 로 받는다.
export const TenantRoutes = ({ user, onLogout, onUnauthorized }) => (
  <Routes>
    <Route path="/contracts/:contractId" element={<ContractPage onUnauthorized={onUnauthorized} />} />
    <Route path="/search" element={<SearchRoute user={user} onUnauthorized={onUnauthorized} />} />
    <Route path="*" element={<TabScreens user={user} onLogout={onLogout} onUnauthorized={onUnauthorized} />} />
  </Routes>
);
