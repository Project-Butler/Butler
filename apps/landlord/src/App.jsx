import { useCallback, useEffect, useRef, useState } from 'react';
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

// 화면 전환은 라우터 없이 App의 view({ key, params }) + History API로 한다.
// navigate = pushState(또는 replaceState) + setView, 브라우저 뒤로가기는 popstate로 view를 되살린다.
// 새로고침·딥링크는 로그인처럼 홈부터 다시 시작한다.
const HOME_VIEW = { key: 'home', params: {} };

// 하위 화면은 사이드바에서 '내 부동산'(건물 목록)을 선택된 메뉴로 보여 준다. 초기 세팅은 홈 아래.
const NAV_KEY_BY_VIEW = {
  properties: 'buildingList',
  propertyDetail: 'buildingList',
  propertyRegister: 'buildingList',
  buildingRegister: 'buildingList',
  buildingEdit: 'buildingList',
  buildingDetail: 'buildingList',
  setup: 'home',
};
const SUB_TITLE_BY_VIEW = {
  properties: '호실 목록',
  propertyDetail: '호실 상세',
  propertyRegister: '호실 등록',
  buildingRegister: '건물 등록',
  buildingEdit: '건물 수정',
  buildingDetail: '건물 상세',
  setup: '초기 세팅',
};

export const App = () => {
  const [user, setUser] = useState(null);
  // 새로고침해도 로그인이 풀리지 않게, 처음 열 때 쿠키 세션(GET /auth/me)을 확인한다.
  const [isRestoring, setIsRestoring] = useState(true);
  const [view, setView] = useState(HOME_VIEW);
  // 로그인마다 새로 만드는 세션 표식. history 항목에 같이 저장해, 이전 세션에서 쌓인 항목이
  // 재로그인 뒤 뒤로가기로 되살아나지 않게 한다(표식이 다르면 홈으로 본다).
  const viewRef = useRef(HOME_VIEW);
  const sessionRef = useRef(String(Date.now()));

  const navigate = useCallback((key, params = {}, { replace = false } = {}) => {
    // 이미 보고 있는 화면(같은 key·params)이면 기록을 더 쌓지 않는다.
    if (!replace && key === viewRef.current.key && JSON.stringify(params) === JSON.stringify(viewRef.current.params)) return;
    const nextView = { key, params };
    const historyState = { view: nextView, session: sessionRef.current };
    if (replace) {
      window.history.replaceState(historyState, '');
    } else {
      window.history.pushState(historyState, '');
    }
    viewRef.current = nextView;
    setView(nextView);
  }, []);

  const resetToHome = useCallback(() => {
    window.history.replaceState({ view: HOME_VIEW, session: sessionRef.current }, '');
    viewRef.current = HOME_VIEW;
    setView(HOME_VIEW);
  }, []);

  // 화면 도중 세션이 끊기면(401) 오류 박스 대신 로그인 화면으로 돌아간다. hook이 401을 받으면 부른다.
  const handleUnauthorized = useCallback(() => {
    setUser(null);
    resetToHome();
  }, [resetToHome]);

  useEffect(() => {
    let isActive = true;
    getMe()
      .then(({ user: sessionUser }) => {
        if (!isActive) return;
        resetToHome();
        setUser(sessionUser);
      })
      .catch(() => {})
      .finally(() => {
        if (isActive) setIsRestoring(false);
      });
    return () => {
      isActive = false;
    };
  }, [resetToHome]);

  // 로그아웃 상태에서는 뒤로가기로 보호 화면 state가 살아나지 않도록 popstate를 듣지 않는다.
  useEffect(() => {
    if (!user) return undefined;

    const handlePopState = (event) => {
      const state = event.state;
      if (state?.session !== sessionRef.current) {
        resetToHome();
        return;
      }
      viewRef.current = state.view;
      setView(state.view);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user, resetToHome]);

  const handleLogin = async ({ email, password }) => {
    const { user: loggedInUser } = await postLogin({ email, password });
    sessionRef.current = String(Date.now());
    resetToHome();
    setUser(loggedInUser);
  };

  const handleLogout = async () => {
    await postLogout();
    setUser(null);
    resetToHome();
  };

  if (isRestoring) {
    return (
      <p role="status" className="flex min-h-screen items-center justify-center bg-ground text-body text-ink-3">
        불러오는 중입니다
      </p>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        brand="Butler"
        subtitle="임대인 전용"
        devHint={import.meta.env.DEV ? 'fixture 계정: landlord@butler.test / password123' : undefined}
        onSubmit={handleLogin}
      />
    );
  }

  const renderPage = () => {
    const pageProps = { onNavigate: navigate, onUnauthorized: handleUnauthorized };

    switch (view.key) {
      case 'buildingList':
        return <BuildingListPage {...pageProps} />;
      case 'buildingRegister':
        return <BuildingRegisterPage user={user} params={view.params} {...pageProps} />;
      case 'buildingDetail':
        return (
          <BuildingDetailPage
            key={view.params.landlordBuildingId}
            landlordBuildingId={view.params.landlordBuildingId}
            {...pageProps}
          />
        );
      case 'buildingEdit':
        return (
          <BuildingEditPage key={view.params.landlordBuildingId} landlordBuildingId={view.params.landlordBuildingId} {...pageProps} />
        );
      case 'setup':
        return <SetupPage params={view.params} {...pageProps} />;
      case 'properties':
        // 예전 소유 호실 등 관계별 호실 목록(건물 목록에서 들어온다)
        return <PropertyListPage relation={view.params.relation ?? 'OWNER'} {...pageProps} />;
      case 'propertyDetail':
        return <PropertyDetailPage key={view.params.propertyId} propertyId={view.params.propertyId} {...pageProps} />;
      case 'propertyRegister':
        // 건물(complexId)이 바뀌면 화면 상태를 새로 시작한다(key).
        return <PropertyRegisterPage key={view.params.complexId ?? 'pick'} params={view.params} {...pageProps} />;
      default:
        // 홈과 아직 화면이 없는 메뉴는 대시보드를 보여 준다(자리).
        return <LandlordDashboard {...pageProps} />;
    }
  };

  return (
    <>
      <InstallBanner />
      <LandlordLayout
        user={user}
        onLogout={handleLogout}
        activeKey={NAV_KEY_BY_VIEW[view.key] ?? view.key}
        subTitle={SUB_TITLE_BY_VIEW[view.key]}
        onNavigate={navigate}
      >
        {renderPage()}
      </LandlordLayout>
    </>
  );
};
