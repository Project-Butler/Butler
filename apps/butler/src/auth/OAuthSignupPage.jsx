import { Link, useNavigate } from 'react-router-dom';
import { MobileOAuthSignupScreen, OAuthSignupScreen } from '@butler/ui';
import { getOAuthSignup, postOAuthSignup } from '@butler/api-client';
import { useSessionStore } from '../store/sessionStore';
import { invitePath } from './invitePath';
import { LOGIN_PATH } from './useLogout';

const AUTH_LINK_CLASS = 'font-semibold text-accent-strong hover:underline';

// 소셜 로그인으로 처음 온 사람이 추가 정보를 입력하는 화면(API 콜백이 /register/oauth 로 보낸다). 가입 직후 로그인 상태가 된다.
// surface 가 app 이면 모바일 화면, web 이면 웹 화면. 불러오는 API 와 가입 API 는 같다.
// invitationToken(초대 소셜 가입 /invite/:token/register/oauth): 화면·가입 API 는 그대로다. 초대는 서버가 쿠키(bt_oi)로 안다.
// 뒤로 가기만 그 초대 화면으로 돌아간다.
export const OAuthSignupPage = ({ surface = 'web', invitationToken }) => {
  const login = useSessionStore((state) => state.login);
  const navigate = useNavigate();
  const backPath = invitationToken ? invitePath(invitationToken) : LOGIN_PATH;

  const handleOAuthSignup = async (values) => {
    const { user } = await postOAuthSignup(values);
    login({ user, verifiedLegalDongCodes: [] });
  };

  if (surface === 'app') {
    return <MobileOAuthSignupScreen loadInfo={getOAuthSignup} onSubmit={handleOAuthSignup} onBack={() => navigate(backPath)} />;
  }

  return (
    <OAuthSignupScreen
      brand="Butler"
      subtitle="임대인 회원가입"
      loadInfo={getOAuthSignup}
      onSubmit={handleOAuthSignup}
      footer={
        <p className="text-body text-ink-2">
          <Link to={LOGIN_PATH} className={AUTH_LINK_CLASS}>
            로그인 화면으로
          </Link>
        </p>
      }
    />
  );
};
