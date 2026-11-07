import { Link, useNavigate } from 'react-router-dom';
import { MobileRegisterScreen, RegisterScreen } from '@butler/ui';
import { getOAuthStartUrl, postEmailVerification, postEmailVerificationConfirm, postRegister } from '@butler/api-client';
import { useSessionStore } from '../store/sessionStore';
import { LOGIN_PATH } from './useLogout';

const AUTH_LINK_CLASS = 'font-semibold text-accent-strong hover:underline';

// 웹 회원가입은 항상 LANDLORD 다(임차인은 초대 링크로만 가입). 가입하면 바로 로그인 상태가 된다.
// surface 가 app 이면 Figma 모바일 화면(M02, 두 단계), web 이면 웹 화면. 입력 항목·API 는 같다.
export const RegisterPage = ({ surface = 'web' }) => {
  const login = useSessionStore((state) => state.login);
  const navigate = useNavigate();

  const handleRegister = async (values) => {
    const { user } = await postRegister({ ...values, role: 'LANDLORD' });
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
        socialLoginHref={getOAuthStartUrl}
        onBack={() => navigate(LOGIN_PATH)}
        footer={
          <p className="text-center text-body text-ink-2">
            이미 계정이 있으신가요?{' '}
            <Link to={LOGIN_PATH} className={AUTH_LINK_CLASS}>
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
      socialLoginHref={getOAuthStartUrl}
      footer={
        <p className="text-body text-ink-2">
          이미 계정이 있으신가요?{' '}
          <Link to={LOGIN_PATH} className={AUTH_LINK_CLASS}>
            로그인
          </Link>
        </p>
      }
    />
  );
};
