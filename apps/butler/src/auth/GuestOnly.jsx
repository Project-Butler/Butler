import { Navigate, useLocation } from 'react-router-dom';
import { useSessionStore } from '../store/sessionStore';
import { resolveAfterLogin } from './roleHome';
import { UnsupportedAccount } from './UnsupportedAccount';

// 로그인·가입 화면 앞의 문. 이미 로그인한 사람(로그인·가입 직후 포함)은 원래 가려던 곳으로 보낸다.
// from 이 내 역할 접두어가 아니면 역할 홈이다(resolveAfterLogin).
// from prop 을 주면 location.state.from 대신 쓴다(초대 가입: 가입을 마치면 그 초대 화면으로 돌아간다).
export const GuestOnly = ({ children, from }) => {
  const user = useSessionStore((state) => state.user);
  const location = useLocation();

  if (!user) return children;
  const target = resolveAfterLogin(from ?? location.state?.from, user.role);
  return target === null ? <UnsupportedAccount /> : <Navigate to={target} replace />;
};
