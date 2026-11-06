import { useCallback } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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
import { buildLocation, HOME_PATH, resolveViewKey, ROUTE_TABLE } from './routes';

// 화면 전환은 react-router로 하고, 경로 표는 routes.js에 있다. 이 컴포넌트는 앱의 /admin/* 아래에 놓인다.
// 로그인·세션·역할 확인은 앱 최상위(App, RequireRole)가 하고, 여기는 user·onLogout·onUnauthorized 를 props 로 받는다.
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

export const AdminRoutes = ({ user, onLogout, onUnauthorized }) => {
  const location = useLocation();
  const routerNavigate = useNavigate();

  const navigate = useCallback(
    (key, params, search) => routerNavigate(buildLocation(key, params, search)),
    [routerNavigate],
  );

  const pageProps = { onNavigate: navigate, onUnauthorized };

  return (
    <AdminLayout user={user} onLogout={onLogout} activeKey={resolveViewKey(location.pathname)} onNavigate={navigate}>
      <Routes>
        {ROUTE_TABLE.map((route) => {
          const Page = PAGE_BY_KEY[route.key];
          const element = Page ? <Page {...pageProps} currentUser={user} /> : <ComingSoonPage title={LABEL_BY_KEY[route.key]} />;
          return <Route key={route.key} path={route.path} element={element} />;
        })}
        <Route path="*" element={<Navigate to={HOME_PATH} replace />} />
      </Routes>
    </AdminLayout>
  );
};
