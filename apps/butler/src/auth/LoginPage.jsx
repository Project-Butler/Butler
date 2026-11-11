import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LoginScreen, MobileLoginScreen } from '@butler/ui';
import { getOAuthStartUrl, postLogin } from '@butler/api-client';
import { useSessionStore } from '../store/sessionStore';
import { getInviteTokenFromPath, inviteRegisterPath } from './invitePath';
import { getOAuthErrorMessage } from './oauthErrorMessages';
import { LOGIN_PATH } from './useLogout';

const AUTH_LINK_CLASS = 'font-semibold text-accent-strong hover:underline';
// 로컬 확인용 계정(apps/api prisma seed). landapp 은 부동산이 없는 임대인 계정으로, 앱 화면(?surface=app)을 처음부터 확인할 때 쓴다.
const DEV_HINT = 'fixture 계정: landlord@butler.test · landapp@butler.test(앱 확인용) · tenant@butler.test · admin@butler.test / password123';

// 로그인 화면 하나를 모든 역할이 쓴다. 로그인한 뒤 어디로 갈지는 GuestOnly 가 역할과 from 으로 정한다.
// surface 가 app 이면 Figma 모바일 화면(M01), web 이면 웹 화면. 부르는 API 와 넘기는 값은 같다.
// 초대 화면에서 왔으면(from 이 /invite/:token) 보이는 화면은 그대로 두고(결정 11) 화면 밖 동작만 바꾼다:
//   '회원가입' → 초대 가입(/invite/:token/register, 임대인 가입으로 가면 수락이 막힌다), 소셜 버튼 → ?invite= 붙은 시작 주소.
export const LoginPage = ({ surface = 'web' }) => {
  const login = useSessionStore((state) => state.login);
  const location = useLocation();
  const navigate = useNavigate();
  const inviteToken = getInviteTokenFromPath(location.state?.from);
  const registerPath = inviteToken ? inviteRegisterPath(inviteToken) : '/register';
  const socialLoginHref = inviteToken ? (provider) => getOAuthStartUrl(provider, inviteToken) : getOAuthStartUrl;

  // 소셜 로그인 실패 문구. API 가 /login?oauth_error=코드 로 보내면 한 번 읽고 주소에서 지운다(돌아갈 곳 from 은 남긴다).
  // 로그인 화면은 initialError 를 처음 마운트될 때만 읽으므로, 문구는 첫 렌더에서 바로 정한다.
  const [oauthError] = useState(() => {
    const code = new URLSearchParams(location.search).get('oauth_error');
    return code ? getOAuthErrorMessage(code) : '';
  });
  useEffect(() => {
    if (new URLSearchParams(location.search).get('oauth_error')) navigate(LOGIN_PATH, { replace: true, state: location.state });
  }, [location.search, location.state, navigate]);

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
        socialLoginHref={socialLoginHref}
        footer={
          <Link to={registerPath} className="font-semibold text-accent">
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
      socialLoginHref={socialLoginHref}
      footer={
        <p className="text-body text-ink-2">
          계정이 없으신가요?{' '}
          <Link to={registerPath} className={AUTH_LINK_CLASS}>
            회원가입
          </Link>
        </p>
      }
    />
  );
};
