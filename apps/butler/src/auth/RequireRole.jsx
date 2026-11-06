import { Navigate, useLocation } from 'react-router-dom';
import { useSessionStore } from '../store/sessionStore';
import { getRoleHome, isKnownRole } from './roleHome';
import { LOGIN_PATH } from './useLogout';
import { UnsupportedAccount } from './UnsupportedAccount';

// 역할 화면 앞의 문. children(역할 화면)은 통과한 뒤에만 그려지므로, 거절된 사람에게는 화면이 그려지지도
// (lazy 로 나눈 모듈이면) 내려받아지지도 않는다.
//  - 로그인 전: /login 으로. 가려던 곳은 from 으로 남긴다.
//  - 다른 역할: 내 역할 홈으로.
// 실제 보안 경계는 API 의 roleGuard 이고, 여기는 화면 분기다.
export const RequireRole = ({ role, children }) => {
  const user = useSessionStore((state) => state.user);
  const location = useLocation();

  if (!user) return <Navigate to={LOGIN_PATH} replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (!isKnownRole(user.role)) return <UnsupportedAccount />;
  if (user.role !== role) return <Navigate to={getRoleHome(user.role)} replace />;
  return children;
};
