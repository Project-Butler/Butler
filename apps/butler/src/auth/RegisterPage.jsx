import { Link } from 'react-router-dom';
import { RegisterScreen } from '@butler/ui';
import { getOAuthStartUrl, postEmailVerification, postEmailVerificationConfirm, postRegister } from '@butler/api-client';
import { useSessionStore } from '../store/sessionStore';

const AUTH_LINK_CLASS = 'font-semibold text-accent-strong hover:underline';

// 웹 회원가입은 항상 LANDLORD 다(임차인은 초대 링크로만 가입). 가입하면 바로 로그인 상태가 된다.
export const RegisterPage = () => {
  const login = useSessionStore((state) => state.login);

  const handleRegister = async (values) => {
    const { user } = await postRegister({ ...values, role: 'LANDLORD' });
    login({ user, verifiedLegalDongCodes: [] });
  };

  return (
    <RegisterScreen
      brand="Butler"
      subtitle="임대인 회원가입"
      onSubmit={handleRegister}
      onRequestEmailCode={(email) => postEmailVerification({ email })}
      onConfirmEmailCode={(email, code) => postEmailVerificationConfirm({ email, code })}
      socialLoginHref={getOAuthStartUrl}
      footer={
        <p className="text-body text-ink-2">
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className={AUTH_LINK_CLASS}>
            로그인
          </Link>
        </p>
      }
    />
  );
};
