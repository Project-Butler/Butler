import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AccountCard } from '../../shared/AccountCard';
import { ComingSoon } from '../../shared/ComingSoon';
import { HOME_PATH } from '../web/routes';
import { AppTabShell } from './components/AppTabShell/AppTabShell';
import { BuildingListPage } from './pages/BuildingListPage';
import { ContractDetailPage } from './pages/ContractDetailPage';
import { ContractEditPage } from './pages/ContractEditPage';
import { HomePage } from './pages/HomePage';
import { ManagementLogListPage } from './pages/ManagementLogListPage';
import { PropertyDetailPage } from './pages/PropertyDetailPage';
import { PropertyRegisterPage } from './pages/PropertyRegisterPage';
import { isTabActive, SETTINGS_PATH, TABS } from './tabs';

// 탭이 있는 앱 화면(홈형 상단 바 + 하단 탭). 앱 화면이 아직 없는 주소는 모두 앱 셸 안의 "준비 중"이다.
// 상단 바 아바타의 이름은 '내 계정'이다(하단 탭 '내 정보'와 같은 이름의 버튼이 둘 생기지 않게).
// 홈형 상단 바: 아바타(내 계정)를 누르면 내 정보로 간다.
const useHomeTopBar = (user) => {
  const navigate = useNavigate();
  return { avatar: { name: user.name, label: '내 계정', onClick: () => navigate(SETTINGS_PATH) } };
};

const HomeTopBarShell = ({ user, children }) => <AppTabShell topBar={useHomeTopBar(user)}>{children}</AppTabShell>;

const BuildingListRoute = ({ user, onUnauthorized }) => <BuildingListPage topBar={useHomeTopBar(user)} onUnauthorized={onUnauthorized} />;

const TabScreens = ({ user, onLogout, onUnauthorized }) => {
  const { pathname } = useLocation();
  const current = TABS.find((tab) => isTabActive(tab, pathname));

  return (
    <HomeTopBarShell user={user}>
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
    </HomeTopBarShell>
  );
};

// 주소의 id 가 바뀌면 화면을 새로 시작한다(앞 호실·계약의 상태가 남지 않게).
const PropertyDetailRoute = ({ onUnauthorized }) => {
  const { propertyId } = useParams();
  return <PropertyDetailPage key={propertyId} propertyId={propertyId} onUnauthorized={onUnauthorized} />;
};

const ContractDetailRoute = ({ onUnauthorized }) => {
  const { contractId } = useParams();
  return <ContractDetailPage key={contractId} contractId={contractId} onUnauthorized={onUnauthorized} />;
};

const ContractEditRoute = ({ onUnauthorized }) => {
  const { contractId } = useParams();
  return <ContractEditPage key={contractId} contractId={contractId} onUnauthorized={onUnauthorized} />;
};

const ManagementLogListRoute =({ onUnauthorized }) => {
  const [searchParams] = useSearchParams();
  return <ManagementLogListPage propertyId={searchParams.get('propertyId') ?? undefined} onUnauthorized={onUnauthorized} />;
};

// 임대인 앱 화면. 이 컴포넌트는 앱의 /landlord/* 아래에 놓인다(주소는 웹과 같고 화면만 다르다).
// 홈(M03)은 탭 화면 안에 둔다. 상단 바가 화면마다 다른 내 자산(M05)·부동산 상세(M06)·관리 로그(M08)는 화면이 직접 탭 셸을 그리고,
// 부동산 등록(M04)·계약 관리(M07)·계약 수정처럼 하단 탭이 없는 화면은 탭 셸 밖에 놓는다.
// 아래에 없는 하위 주소(/properties/:id/verify, /logs/:id 등)는 탭 화면의 "준비 중"으로 간다.
// 로그인·세션은 앱 최상위가 하고, 여기는 user·onLogout·onUnauthorized 를 props 로 받는다.
export const LandlordAppRoutes = ({ user, onLogout, onUnauthorized }) => (
  <Routes>
    <Route path="/properties/new" element={<PropertyRegisterPage onUnauthorized={onUnauthorized} />} />
    <Route path="/buildings" element={<BuildingListRoute user={user} onUnauthorized={onUnauthorized} />} />
    <Route path="/properties/:propertyId" element={<PropertyDetailRoute onUnauthorized={onUnauthorized} />} />
    {/* 계약 등록은 앱 화면이 아직 없다. /contracts/:contractId 가 'new'를 계약 id 로 읽지 않게 따로 둔다. */}
    <Route
      path="/contracts/new"
      element={
        <HomeTopBarShell user={user}>
          <ComingSoon title="준비 중인 화면" />
        </HomeTopBarShell>
      }
    />
    <Route path="/contracts/:contractId" element={<ContractDetailRoute onUnauthorized={onUnauthorized} />} />
    <Route path="/contracts/:contractId/edit" element={<ContractEditRoute onUnauthorized={onUnauthorized} />} />
    <Route path="/logs" element={<ManagementLogListRoute onUnauthorized={onUnauthorized} />} />
    <Route path="*" element={<TabScreens user={user} onLogout={onLogout} onUnauthorized={onUnauthorized} />} />
  </Routes>
);
