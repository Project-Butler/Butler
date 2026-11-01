import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LoginScreen } from '@butler/ui';
import { getMe, postLogin, postLogout } from '@butler/api-client';
import { InstallBanner } from './install/InstallBanner';
import { LandlordLayout } from './layout/LandlordLayout';
import { LandlordDashboard } from './dashboard/LandlordDashboard';
import { BuildingListPage } from './pages/BuildingListPage';
import { ContractDetailPage } from './pages/ContractDetailPage';
import { ContractEditPage } from './pages/ContractEditPage';
import { ContractListPage } from './pages/ContractListPage';
import { ContractRegisterPage } from './pages/ContractRegisterPage';
import { PropertyListPage } from './pages/PropertyListPage';
import { PropertyDetailPage } from './pages/PropertyDetailPage';
import { PropertyRegisterPage } from './pages/PropertyRegisterPage';
import { SetupPage } from './pages/SetupPage';
import { DisputeChatPage } from './pages/DisputeChatPage';
import { DisputePage } from './pages/DisputePage';
import { DisputeReferenceDetailPage } from './pages/DisputeReferenceDetailPage';
import { DisputeSearchPage } from './pages/DisputeSearchPage';
import { useGetContractList } from './hooks/useGetContractList';
import { buildLocation, HOME_PATH, resolveViewKey } from './routes';

// 화면 전환은 react-router(BrowserRouter)로 하고, 경로 표는 routes.js에 있다.
// 화면 컴포넌트는 그대로 onNavigate(key, params, { replace })로 이동한다. navigate가 key를 경로로 바꿔 준다.

// 하위 화면은 사이드바에서 '내 부동산'을 선택된 메뉴로 보여 준다. 초기 세팅은 홈 아래.
const NAV_KEY_BY_VIEW = {
  properties: 'buildingList',
  propertyDetail: 'buildingList',
  propertyRegister: 'buildingList',
  contracts: 'leases',
  contractRegister: 'leases',
  contractEdit: 'leases',
  contractDetail: 'leases',
  setup: 'home',
  disputeReference: 'disputes',
  disputeChat: 'disputes',
};
const SUB_TITLE_BY_VIEW = {
  properties: '호실 목록',
  propertyDetail: '호실 상세',
  propertyRegister: '부동산 등록',
  contracts: '계약 목록',
  contractRegister: '계약 등록',
  contractEdit: '계약 수정',
  contractDetail: '계약 상세',
  setup: '초기 세팅',
  disputes: '분쟁 해결사',
  disputeReference: '사례 상세',
};

const LOGIN_PATH = '/login';

// 라우트 요소: 경로 파라미터를 화면 props로 옮긴다. id가 바뀌면 화면 상태를 새로 시작한다(key).
const BuildingListRoute = (pageProps) => {
  const { state } = useLocation();
  return <BuildingListPage params={{ notice: state?.notice }} {...pageProps} />;
};

const PropertyDetailRoute = (pageProps) => {
  const { propertyId } = useParams();
  return <PropertyDetailPage key={propertyId} propertyId={propertyId} {...pageProps} />;
};

const PropertyListRoute = (pageProps) => {
  // 예전 소유 호실 등 관계별 호실 목록(내 부동산에서 들어온다)
  const [searchParams] = useSearchParams();
  return <PropertyListPage relation={searchParams.get('relation') ?? 'OWNER'} {...pageProps} />;
};

const ContractRegisterRoute = (pageProps) => {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get('propertyId') ?? undefined;
  const renewFrom = searchParams.get('renewFrom') ?? undefined;
  // 미리 채울 값(호실·이전 계약)이 바뀌면 화면 상태를 새로 시작한다(key).
  return <ContractRegisterPage key={`${propertyId}-${renewFrom}`} params={{ propertyId, renewFrom }} {...pageProps} />;
};

const ContractDetailRoute = (pageProps) => {
  const { contractId } = useParams();
  return <ContractDetailPage key={contractId} contractId={contractId} {...pageProps} />;
};

const ContractEditRoute = (pageProps) => {
  const { contractId } = useParams();
  return <ContractEditPage key={contractId} contractId={contractId} {...pageProps} />;
};

// 사이드바 '계약' 배지 = 만료 임박(EXPIRING_SOON) 계약 수(D-17). 로그인한 뒤에만 그려서 조회한다.
// 계약 메뉴 배지 = 만료 임박 건수. 화면을 옮길 때마다 다시 세어 등록·해지 뒤에도 맞게 한다.
const LayoutWithBadges = ({ onUnauthorized, ...layoutProps }) => {
  const { pathname } = useLocation();
  const expiringSoon = useGetContractList({ status: 'EXPIRING_SOON', size: 1 }, { onUnauthorized });
  const { refetch } = expiringSoon;
  const visitedPathRef = useRef(pathname);
  useEffect(() => {
    // 처음 그릴 때는 훅이 이미 불러오므로 경로가 바뀔 때만 다시 센다.
    if (visitedPathRef.current === pathname) return;
    visitedPathRef.current = pathname;
    refetch();
  }, [pathname, refetch]);
  return <LandlordLayout navBadges={{ leases: expiringSoon.data?.meta.total ?? 0 }} {...layoutProps} />;
};

export const App = () => {
  const [user, setUser] = useState(null);
  // 새로고침해도 로그인이 풀리지 않게, 처음 열 때 쿠키 세션(GET /auth/me)을 확인한다.
  const [isRestoring, setIsRestoring] = useState(true);
  const location = useLocation();
  const routerNavigate = useNavigate();
  const locationRef = useRef(location);
  locationRef.current = location;

  const navigate = useCallback(
    (key, params = {}, { replace = false } = {}) => {
      const { pathname, search = '', state } = buildLocation(key, params);
      const current = locationRef.current;
      // 이미 보고 있는 화면(같은 경로·쿼리)이면 기록을 더 쌓지 않는다.
      if (!replace && pathname === current.pathname && search === current.search) return;
      routerNavigate({ pathname, search }, { replace, state });
    },
    [routerNavigate],
  );

  // 화면 도중 세션이 끊기면(401) 오류 박스 대신 로그인 화면으로 돌아간다. hook이 401을 받으면 부른다.
  // user가 비면 아래 가드가 /login으로 보내고, 원래 보던 경로를 기억해 둔다.
  const handleUnauthorized = useCallback(() => {
    setUser(null);
  }, []);

  useEffect(() => {
    let isActive = true;
    getMe()
      .then(({ user: sessionUser }) => {
        if (isActive) setUser(sessionUser);
      })
      .catch(() => {})
      .finally(() => {
        if (isActive) setIsRestoring(false);
      });
    return () => {
      isActive = false;
    };
  }, []);

  const handleLogin = async ({ email, password }) => {
    const { user: loggedInUser } = await postLogin({ email, password });
    setUser(loggedInUser);
  };

  const handleLogout = async () => {
    await postLogout();
    // 다음 로그인이 이전 사용자가 보던 경로로 돌아가지 않게 /login으로 직접 보낸다.
    routerNavigate(LOGIN_PATH, { replace: true });
    setUser(null);
  };

  if (isRestoring) {
    return (
      <p role="status" className="flex min-h-screen items-center justify-center bg-ground text-body text-ink-3">
        불러오는 중입니다
      </p>
    );
  }

  const isLoginPath = location.pathname === LOGIN_PATH;

  if (!user) {
    // 로그인 전에는 어떤 주소로 와도 /login으로 보내고, 로그인하면 원래 가려던 곳으로 돌려보낸다.
    if (!isLoginPath) {
      return <Navigate to={LOGIN_PATH} replace state={{ from: `${location.pathname}${location.search}` }} />;
    }
    return (
      <LoginScreen
        brand="Butler"
        subtitle="임대인 전용"
        devHint={import.meta.env.DEV ? 'fixture 계정: landlord@butler.test / password123' : undefined}
        onSubmit={handleLogin}
      />
    );
  }

  // 로그인된 상태로 /login에 오면(로그인 직후 포함) 원래 가려던 곳, 없으면 홈으로 보낸다.
  if (isLoginPath) {
    return <Navigate to={location.state?.from ?? HOME_PATH} replace />;
  }

  const viewKey = resolveViewKey(location.pathname);
  const pageProps = { onNavigate: navigate, onUnauthorized: handleUnauthorized };

  return (
    <>
      <InstallBanner />
      <LayoutWithBadges
        onUnauthorized={handleUnauthorized}
        user={user}
        onLogout={handleLogout}
        activeKey={NAV_KEY_BY_VIEW[viewKey] ?? viewKey}
        subTitle={SUB_TITLE_BY_VIEW[viewKey]}
        onNavigate={navigate}
      >
        <Routes>
          <Route path="/" element={<Navigate to={HOME_PATH} replace />} />
          <Route path={HOME_PATH} element={<LandlordDashboard {...pageProps} />} />
          <Route path="/buildings" element={<BuildingListRoute {...pageProps} />} />
          <Route path="/properties" element={<PropertyListRoute {...pageProps} />} />
          <Route path="/properties/new" element={<PropertyRegisterPage {...pageProps} />} />
          <Route path="/properties/:propertyId" element={<PropertyDetailRoute {...pageProps} />} />
          <Route path="/contracts" element={<ContractListPage {...pageProps} />} />
          <Route path="/contracts/new" element={<ContractRegisterRoute {...pageProps} />} />
          <Route path="/contracts/:contractId" element={<ContractDetailRoute {...pageProps} />} />
          <Route path="/contracts/:contractId/edit" element={<ContractEditRoute {...pageProps} />} />
          <Route path="/setup" element={<SetupPage {...pageProps} />} />
          {/* 좁은 화면의 AI 상담(#2 담당 화면). 사례에서 넘긴 질문(history state draft)을 미리 채우는 건 담당자와 협의 후. */}
          <Route path="/disputes/chat" element={<DisputeChatPage />} />
          <Route path="/disputes" element={<DisputePage {...pageProps} />}>
            <Route index element={<DisputeSearchPage />} />
            <Route path="references/:referenceId" element={<DisputeReferenceDetailPage />} />
          </Route>
          {/* 아직 화면이 없는 메뉴는 대시보드를 보여 준다(자리). */}
          <Route path="*" element={<LandlordDashboard {...pageProps} />} />
        </Routes>
      </LayoutWithBadges>
    </>
  );
};
