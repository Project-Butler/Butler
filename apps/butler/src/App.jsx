import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { FullScreenStatus } from './auth/FullScreenStatus';
import { GuestOnly } from './auth/GuestOnly';
import { LoginPage } from './auth/LoginPage';
import { OAuthSignupPage } from './auth/OAuthSignupPage';
import { RegisterPage } from './auth/RegisterPage';
import { RequireRole } from './auth/RequireRole';
import { RootRedirect } from './auth/RootRedirect';
import { useLogout } from './auth/useLogout';
import { useSessionStore } from './store/sessionStore';
import { getSurface } from './surface/getSurface';

// 역할별 화면은 들어갈 때만 내려받는다(코드 분할). RequireRole 을 통과하기 전에는 그려지지 않으니 내려받아지지도 않는다.
const AdminRoutes = lazy(() => import('./admin/AdminRoutes').then((module) => ({ default: module.AdminRoutes })));
const LandlordWebRoutes = lazy(() => import('./landlord/web/LandlordWebRoutes').then((module) => ({ default: module.LandlordWebRoutes })));
const LandlordAppRoutes = lazy(() => import('./landlord/app/LandlordAppRoutes').then((module) => ({ default: module.LandlordAppRoutes })));
const TenantRoutes = lazy(() => import('./tenant/TenantRoutes').then((module) => ({ default: module.TenantRoutes })));

const WAITING = <FullScreenStatus>불러오는 중입니다</FullScreenStatus>;

// 분기는 두 번이다. ① 역할로 admin·landlord·tenant 를 고르고(RequireRole + 주소 접두어) ② 임대인이면 surface 로 web·app 을 고른다.
// 관리자는 항상 웹, 임차인은 항상 앱 화면이다. 역할 폴더는 auth·store·surface 를 import하지 못하므로 필요한 값은 props 로 넘긴다.
export const App = () => {
  const isRestoring = useSessionStore((state) => state.isRestoring);
  const user = useSessionStore((state) => state.user);
  const verifiedLegalDongCodes = useSessionStore((state) => state.verifiedLegalDongCodes);
  const restoreSession = useSessionStore((state) => state.restoreSession);
  const clearSession = useSessionStore((state) => state.clearSession);
  const refreshMe = useSessionStore((state) => state.refreshMe);
  const logout = useLogout();

  // 새로고침해도 로그인이 풀리지 않게, 처음 열 때 쿠키 세션(GET /auth/me)을 확인한다.
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  if (isRestoring) return WAITING;

  // 화면 도중 세션이 끊기면(401) clearSession 으로 로그아웃 상태가 되고, RequireRole 이 /login 으로 보낸다.
  const roleProps = { user, verifiedLegalDongCodes, onLogout: logout, onUnauthorized: clearSession, onRefreshMe: refreshMe };
  // 로그인·가입 화면도 surface 로 모양(웹 · 앱 M01·M02·소셜 가입)을 고른다. 역할을 모르는 화면이라 기기 기준 그대로다.
  const surface = getSurface();
  const LandlordRoutes = surface === 'app' ? LandlordAppRoutes : LandlordWebRoutes;

  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><LoginPage surface={surface} /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><RegisterPage surface={surface} /></GuestOnly>} />
      <Route path="/register/oauth" element={<GuestOnly><OAuthSignupPage surface={surface} /></GuestOnly>} />
      <Route
        path="/admin/*"
        element={
          <RequireRole role="ADMIN">
            <Suspense fallback={WAITING}>
              <AdminRoutes {...roleProps} />
            </Suspense>
          </RequireRole>
        }
      />
      <Route
        path="/landlord/*"
        element={
          <RequireRole role="LANDLORD">
            <Suspense fallback={WAITING}>
              <LandlordRoutes {...roleProps} />
            </Suspense>
          </RequireRole>
        }
      />
      <Route
        path="/tenant/*"
        element={
          <RequireRole role="TENANT">
            <Suspense fallback={WAITING}>
              <TenantRoutes {...roleProps} />
            </Suspense>
          </RequireRole>
        }
      />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
};
