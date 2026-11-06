import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LoginScreen } from '@butler/ui';
import { getOAuthStartUrl, postLogin } from '@butler/api-client';
import { useSessionStore } from '../store/sessionStore';
import { getOAuthErrorMessage } from './oauthErrorMessages';
import { LOGIN_PATH } from './useLogout';

const AUTH_LINK_CLASS = 'font-semibold text-accent-strong hover:underline';

// 로그인 화면 하나를 모든 역할이 쓴다. 로그인한 뒤 어디로 갈지는 GuestOnly 가 역할과 from 으로 정한다.
export const LoginPage = () => {
  const login = useSessionStore((state) => state.login);
  const location = useLocation();
  const navigate = useNavigate();

  // 소셜 로그인 실패 문구. API 가 /login?oauth_error=코드 로 보내면 한 번 읽고 주소에서 지운다.
  // LoginScreen 은 initialError 를 처음 마운트될 때만 읽으므로, 문구는 첫 렌더에서 바로 정한다.
  const [oauthError] = useState(() => {
    const code = new URLSearchParams(location.search).get('oauth_error');
    return code ? getOAuthErrorMessage(code) : '';
  });
  useEffect(() => {
    if (new URLSearchParams(location.search).get('oauth_error')) navigate(LOGIN_PATH, { replace: true });
  }, [location.search, navigate]);

  const handleLogin = async ({ email, password }) => {
    const { user, verifiedLegalDongCodes } = await postLogin({ email, password });
    login({ user, verifiedLegalDongCodes });
  };

  return (
    <LoginScreen
      brand="Butler"
      subtitle="임대차 관리 서비스"
      devHint={import.meta.env.DEV ? 'fixture 계정: landlord@butler.test · tenant@butler.test · admin@butler.test / password123' : undefined}
      onSubmit={handleLogin}
      initialError={oauthError}
      socialLoginHref={getOAuthStartUrl}
      footer={
        <p className="text-body text-ink-2">
          계정이 없으신가요?{' '}
          <Link to="/register" className={AUTH_LINK_CLASS}>
            회원가입
          </Link>
        </p>
      }
    />
  );
};
