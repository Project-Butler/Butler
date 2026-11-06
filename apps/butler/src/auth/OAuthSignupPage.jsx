import { Link } from 'react-router-dom';
import { OAuthSignupScreen } from '@butler/ui';
import { getOAuthSignup, postOAuthSignup } from '@butler/api-client';
import { useSessionStore } from '../store/sessionStore';

const AUTH_LINK_CLASS = 'font-semibold text-accent-strong hover:underline';

// 소셜 로그인으로 처음 온 사람이 추가 정보를 입력하는 화면(API 콜백이 /register/oauth 로 보낸다). 가입 직후 로그인 상태가 된다.
export const OAuthSignupPage = () => {
  const login = useSessionStore((state) => state.login);

  const handleOAuthSignup = async (values) => {
    const { user } = await postOAuthSignup(values);
    login({ user, verifiedLegalDongCodes: [] });
  };

  return (
    <OAuthSignupScreen
      brand="Butler"
      subtitle="임대인 회원가입"
      loadInfo={getOAuthSignup}
      onSubmit={handleOAuthSignup}
      footer={
        <p className="text-body text-ink-2">
          <Link to="/login" className={AUTH_LINK_CLASS}>
            로그인 화면으로
          </Link>
        </p>
      }
    />
  );
};
