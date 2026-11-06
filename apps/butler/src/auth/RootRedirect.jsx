import { Navigate, useLocation } from 'react-router-dom';
import { useSessionStore } from '../store/sessionStore';
import { getRoleHome } from './roleHome';
import { LOGIN_PATH } from './useLogout';
import { UnsupportedAccount } from './UnsupportedAccount';

// '/' 와 앱에 없는 주소: 로그인 전이면 /login, 로그인 후면 역할 홈.
export const RootRedirect = () => {
  const user = useSessionStore((state) => state.user);
  const location = useLocation();

  if (!user) return <Navigate to={LOGIN_PATH} replace state={{ from: `${location.pathname}${location.search}` }} />;
  const home = getRoleHome(user.role);
  return home === null ? <UnsupportedAccount /> : <Navigate to={home} replace />;
};
