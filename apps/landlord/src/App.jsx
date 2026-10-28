import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LoginScreen } from '@butler/ui';
import { getMe, postLogin, postLogout } from '@butler/api-client';
import { InstallBanner } from './install/InstallBanner';
import { LandlordLayout } from './layout/LandlordLayout';
import { LandlordDashboard } from './dashboard/LandlordDashboard';
import { BuildingDetailPage } from './pages/BuildingDetailPage';
import { BuildingEditPage } from './pages/BuildingEditPage';
import { BuildingListPage } from './pages/BuildingListPage';
import { BuildingRegisterPage } from './pages/BuildingRegisterPage';
import { PropertyListPage } from './pages/PropertyListPage';
import { PropertyDetailPage } from './pages/PropertyDetailPage';
import { PropertyRegisterPage } from './pages/PropertyRegisterPage';
import { SetupPage } from './pages/SetupPage';
import { DisputeChatPage } from './pages/DisputeChatPage';
import { DisputePage } from './pages/DisputePage';
import { DisputeReferenceDetailPage } from './pages/DisputeReferenceDetailPage';
import { DisputeSearchPage } from './pages/DisputeSearchPage';
import { buildLocation, HOME_PATH, resolveViewKey } from './routes';

// 화면 전환은 react-router(BrowserRouter)로 하고, 경로 표는 routes.js에 있다.
// 화면 컴포넌트는 그대로 onNavigate(key, params, { replace })로 이동한다. navigate가 key를 경로로 바꿔 준다.

// 하위 화면은 사이드바에서 '내 부동산'(건물 목록)을 선택된 메뉴로 보여 준다. 초기 세팅은 홈 아래.
const NAV_KEY_BY_VIEW = {
  properties: 'buildingList',
  propertyDetail: 'buildingList',
  propertyRegister: 'buildingList',
  buildingRegister: 'buildingList',
  buildingEdit: 'buildingList',
  buildingDetail: 'buildingList',
  setup: 'home',
  disputeReference: 'disputes',
  disputeChat: 'disputes',
};
const SUB_TITLE_BY_VIEW = {
  properties: '호실 목록',
  propertyDetail: '호실 상세',
  propertyRegister: '호실 등록',
  buildingRegister: '건물 등록',
  buildingEdit: '건물 수정',
  buildingDetail: '건물 상세',
  setup: '초기 세팅',
  disputes: '분쟁 해결사',
  disputeReference: '사례 상세',
};

const LOGIN_PATH = '/login';

// 라우트 요소: 경로 파라미터를 화면 props로 옮긴다. id가 바뀌면 화면 상태를 새로 시작한다(key).
const BuildingDetailRoute = (pageProps) => {
  const { landlordBuildingId } = useParams();
  return <BuildingDetailPage key={landlordBuildingId} landlordBuildingId={landlordBuildingId} {...pageProps} />;
};

const BuildingEditRoute = (pageProps) => {
  const { landlordBuildingId } = useParams();
  return <BuildingEditPage key={landlordBuildingId} landlordBuildingId={landlordBuildingId} {...pageProps} />;
};

const PropertyDetailRoute = (pageProps) => {
  const { propertyId } = useParams();
  return <PropertyDetailPage key={propertyId} propertyId={propertyId} {...pageProps} />;
};

const PropertyListRoute = (pageProps) => {
  // 예전 소유 호실 등 관계별 호실 목록(건물 목록에서 들어온다)
  const [searchParams] = useSearchParams();
  return <PropertyListPage relation={searchParams.get('relation') ?? 'OWNER'} {...pageProps} />;
};

const PropertyRegisterRoute = (pageProps) => {
  const [searchParams] = useSearchParams();
  const complexId = searchParams.get('complexId') ?? undefined;
  // 건물(complexId)이 바뀌면 화면 상태를 새로 시작한다(key).
  return <PropertyRegisterPage key={complexId ?? 'pick'} params={{ complexId }} {...pageProps} />;
};

const SetupRoute = (pageProps) => {
  const { state } = useLocation();
  return <SetupPage params={{ notice: state?.notice }} {...pageProps} />;
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
      <LandlordLayout
        user={user}
        onLogout={handleLogout}
        activeKey={NAV_KEY_BY_VIEW[viewKey] ?? viewKey}
        subTitle={SUB_TITLE_BY_VIEW[viewKey]}
        onNavigate={navigate}
      >
        <Routes>
          <Route path="/" element={<Navigate to={HOME_PATH} replace />} />
          <Route path={HOME_PATH} element={<LandlordDashboard {...pageProps} />} />
          <Route path="/buildings"element={<BuildingListPage {...pageProps} />} />
          <Route path="/buildings/new" element={<BuildingRegisterPage user={user} params={{}} {...pageProps} />} />
          <Route path="/buildings/:landlordBuildingId" element={<BuildingDetailRoute {...pageProps} />} />
          <Route path="/buildings/:landlordBuildingId/edit" element={<BuildingEditRoute {...pageProps} />} />
          <Route path="/properties" element={<PropertyListRoute {...pageProps} />} />
          <Route path="/properties/new" element={<PropertyRegisterRoute {...pageProps} />} />
          <Route path="/properties/:propertyId" element={<PropertyDetailRoute {...pageProps} />} />
          <Route path="/setup" element={<SetupRoute {...pageProps} />} />
          {/* 좁은 화면의 AI 상담(#2 담당 화면). 사례에서 넘긴 질문(history state draft)을 미리 채우는 건 담당자와 협의 후. */}
          <Route path="/disputes/chat" element={<DisputeChatPage />} />
          <Route path="/disputes" element={<DisputePage {...pageProps} />}>
            <Route index element={<DisputeSearchPage />} />
            <Route path="references/:referenceId" element={<DisputeReferenceDetailPage />} />
          </Route>
          {/* 아직 화면이 없는 메뉴는 대시보드를 보여 준다(자리). */}
          <Route path="*" element={<LandlordDashboard {...pageProps} />} />
        </Routes>
      </LandlordLayout>
    </>
  );
};
