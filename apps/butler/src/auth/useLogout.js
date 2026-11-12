import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../store/sessionStore';

export const LOGIN_PATH = '/login';

// 서버 로그아웃 뒤 /login 으로 먼저 이동하고 나서 세션을 지운다(store.logout 의 순서).
// 다음 로그인이 이전 사용자가 보던 경로로 돌아가지 않고, 뒤로 가기를 해도 보호된 화면이 그려지지 않는다.
export const useLogout = () => {
  const navigate = useNavigate();
  const logout = useSessionStore((state) => state.logout);
  return useCallback(() => logout(() => navigate(LOGIN_PATH, { replace: true })), [logout, navigate]);
};
