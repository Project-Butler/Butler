import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LoginScreen } from '@butler/ui';
import { getMe, postLogin, postLogout } from '@butler/api-client';
import { AdminLayout, NAV_ITEMS, SETTINGS_ITEM } from './layout/AdminLayout';
import { AdminDashboard } from './dashboard/AdminDashboard';
import { AuditLogPage } from './pages/AuditLogPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { ComplexCreatePage } from './pages/ComplexCreatePage';
import { ContractDetailPage } from './pages/ContractDetailPage';
import { ContractLookupPage } from './pages/ContractLookupPage';
import { JobListPage } from './pages/JobListPage';
import { OwnershipListPage } from './pages/OwnershipListPage';
import { SettingsPage } from './pages/SettingsPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { UserListPage } from './pages/UserListPage';
import { VerificationAttemptListPage } from './pages/VerificationAttemptListPage';
import { RoleGuard } from './routes/guards/RoleGuard';
import { buildLocation, HOME_PATH, resolveViewKey, ROUTE_TABLE } from './routes';

// 화면 전환은 react-router(BrowserRouter)로 하고, 경로 표는 routes.js에 있다.
const LOGIN_PATH = '/login';
const LABEL_BY_KEY = Object.fromEntries([...NAV_ITEMS, SETTINGS_ITEM].map((item) => [item.key, item.label]));
// 운영 API가 붙은 화면. 여기 없는 key는 '준비 중' 화면을 보여 준다.
const PAGE_BY_KEY = {
  dashboard: AdminDashboard,
  users: UserListPage,
  userDetail: UserDetailPage,
  ownerships: OwnershipListPage,
  complexes: ComplexCreatePage,
  jobs: JobListPage,
  auditLogs: AuditLogPage,
  contracts: ContractLookupPage,
  contractDetail: ContractDetailPage,
  verificationAttempts: VerificationAttemptListPage,
  settings: SettingsPage,
};

export const App = () => {
  const [user, setUser] = useState(null);
  // 새로고침해도 로그인이 풀리지 않게, 처음 열 때 쿠키 세션(GET /auth/me)을 확인한다.
  const [isRestoring, setIsRestoring] = useState(true);
  const location = useLocation();
  const routerNavigate = useNavigate();

  const navigate = useCallback(
    (key, params, search) => routerNavigate(buildLocation(key, params, search)),
    [routerNavigate],
  );

  // 화면 도중 세션이 끊기면(401) 로그인 화면으로 돌아간다. 데이터 hook이 401을 받으면 부른다.
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
        brand="Butler Admin"
        subtitle="운영자 전용"
        devHint={import.meta.env.DEV ? 'fixture 계정: admin@butler.test / password123' : undefined}
        onSubmit={handleLogin}
      />
    );
  }

  // 로그인된 상태로 /login에 오면(로그인 직후 포함) 원래 가려던 곳, 없으면 대시보드로 보낸다.
  if (isLoginPath) {
    return <Navigate to={location.state?.from ?? HOME_PATH} replace />;
  }

  const pageProps = { onNavigate: navigate, onUnauthorized: handleUnauthorized };

  return (
    <RoleGuard user={user} allowedRoles={['ADMIN']} onLogout={handleLogout}>
      <AdminLayout user={user} onLogout={handleLogout} activeKey={resolveViewKey(location.pathname)} onNavigate={navigate}>
        <Routes>
          {ROUTE_TABLE.map((route) => {
            const Page = PAGE_BY_KEY[route.key];
            const element = Page ? <Page {...pageProps} currentUser={user} /> : <ComingSoonPage title={LABEL_BY_KEY[route.key]} />;
            return <Route key={route.key} path={route.path} element={element} />;
          })}
          <Route path="*" element={<Navigate to={HOME_PATH} replace />} />
        </Routes>
      </AdminLayout>
    </RoleGuard>
  );
};
