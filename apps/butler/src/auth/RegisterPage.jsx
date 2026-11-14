import { Link, useNavigate } from 'react-router-dom';
import { MobileRegisterScreen, RegisterScreen } from '@butler/ui';
import { getOAuthStartUrl, postEmailVerification, postEmailVerificationConfirm, postRegister } from '@butler/api-client';
import { useSessionStore } from '../store/sessionStore';
import { invitePath } from './invitePath';
import { LOGIN_PATH } from './useLogout';

const AUTH_LINK_CLASS = 'font-semibold text-accent-strong hover:underline';

// 웹 회원가입은 항상 LANDLORD 다(임차인은 초대 링크로만 가입). 가입하면 바로 로그인 상태가 된다.
// surface 가 app 이면 Figma 모바일 화면(M02, 두 단계), web 이면 웹 화면. 입력 항목·API 는 같다.
// invitationToken(초대 가입 /invite/:token/register): 보이는 화면은 그대로(결정 11). 제출에 invitationToken 을 더하고
// (role 은 서버가 TENANT 로 정한다. 검증이 role 칸을 요구해서 TENANT 를 같이 보낸다), 소셜 버튼은 ?invite= 시작 주소,
// '로그인'·뒤로 가기는 돌아올 초대 주소(from)를 들고 간다. 가입 뒤 이동은 GuestOnly(from) 가 한다.
export const RegisterPage = ({ surface = 'web', invitationToken }) => {
  const login = useSessionStore((state) => state.login);
  const navigate = useNavigate();
  const loginState = invitationToken ? { from: invitePath(invitationToken) } : undefined;
  const socialLoginHref = invitationToken ? (provider) => getOAuthStartUrl(provider, invitationToken) : getOAuthStartUrl;

  const handleRegister = async (values) => {
    const body = invitationToken ? { ...values, role: 'TENANT', invitationToken } : { ...values, role: 'LANDLORD' };
    const { user } = await postRegister(body);
    login({ user, verifiedLegalDongCodes: [] });
  };
  const requestEmailCode = (email) => postEmailVerification({ email });
  const confirmEmailCode = (email, code) => postEmailVerificationConfirm({ email, code });

  if (surface === 'app') {
    return (
      <MobileRegisterScreen
        onSubmit={handleRegister}
        onRequestEmailCode={requestEmailCode}
        onConfirmEmailCode={confirmEmailCode}
        socialLoginHref={socialLoginHref}
        onBack={() => navigate(LOGIN_PATH, { state: loginState })}
        footer={
          <p className="text-center text-body text-ink-2">
            이미 계정이 있으신가요?{' '}
            <Link to={LOGIN_PATH} state={loginState} className={AUTH_LINK_CLASS}>
              로그인
            </Link>
          </p>
        }
      />
    );
  }

  return (
    <RegisterScreen
      brand="Butler"
      subtitle="임대인 회원가입"
      onSubmit={handleRegister}
      onRequestEmailCode={requestEmailCode}
      onConfirmEmailCode={confirmEmailCode}
      socialLoginHref={socialLoginHref}
      footer={
        <p className="text-body text-ink-2">
          이미 계정이 있으신가요?{' '}
          <Link to={LOGIN_PATH} state={loginState} className={AUTH_LINK_CLASS}>
            로그인
          </Link>
        </p>
      }
    />
  );
};
