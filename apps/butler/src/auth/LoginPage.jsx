import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LoginScreen, MobileLoginScreen } from '@butler/ui';
import { getOAuthStartUrl, postLogin } from '@butler/api-client';
import { useSessionStore } from '../store/sessionStore';
import { getOAuthErrorMessage } from './oauthErrorMessages';
import { LOGIN_PATH } from './useLogout';

const AUTH_LINK_CLASS = 'font-semibold text-accent-strong hover:underline';
// 로컬 확인용 계정(apps/api prisma seed). landapp 은 부동산이 없는 임대인 계정으로, 앱 화면(?surface=app)을 처음부터 확인할 때 쓴다.
const DEV_HINT = 'fixture 계정: landlord@butler.test · landapp@butler.test(앱 확인용) · tenant@butler.test · admin@butler.test / password123';

// 로그인 화면 하나를 모든 역할이 쓴다. 로그인한 뒤 어디로 갈지는 GuestOnly 가 역할과 from 으로 정한다.
// surface 가 app 이면 Figma 모바일 화면(M01), web 이면 웹 화면. 부르는 API 와 넘기는 값은 같다.
export const LoginPage = ({ surface = 'web' }) => {
  const login = useSessionStore((state) => state.login);
  const location = useLocation();
  const navigate = useNavigate();

  // 소셜 로그인 실패 문구. API 가 /login?oauth_error=코드 로 보내면 한 번 읽고 주소에서 지운다.
  // 로그인 화면은 initialError 를 처음 마운트될 때만 읽으므로, 문구는 첫 렌더에서 바로 정한다.
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

  const devHint = import.meta.env.DEV ? DEV_HINT : undefined;

  if (surface === 'app') {
    return (
      <MobileLoginScreen
        brand="Butler"
        devHint={devHint}
        onSubmit={handleLogin}
        initialError={oauthError}
        socialLoginHref={getOAuthStartUrl}
        footer={
          <Link to="/register" className="font-semibold text-accent">
            회원가입
          </Link>
        }
      />
    );
  }

  return (
    <LoginScreen
      brand="Butler"
      subtitle="임대차 관리 서비스"
      devHint={devHint}
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
