import { Home } from 'lucide-react';
import { Button } from '../Button/Button';
import { Card } from '../Card/Card';
import { SocialLoginButtons } from '../SocialLoginButtons/SocialLoginButtons';
import { useLoginForm } from './useLoginForm';

// 웹 로그인 화면. 입력·제출은 useLoginForm(앱 MobileLoginScreen 과 같음).
// initialError: 화면을 열 때 바로 보여 줄 오류(소셜 로그인 실패 등). socialLoginHref(provider): 있으면 구글·카카오 링크를 보여 준다.
export const LoginScreen = ({ brand = 'Butler', subtitle, devHint, footer, onSubmit, initialError = '', socialLoginHref }) => {
  const { email, setEmail, password, setPassword, error, isSubmitting, handleSubmit } = useLoginForm({ onSubmit, initialError });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ground px-6 font-sans">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-btn bg-accent text-white">
          <Home size={22} strokeWidth={2.25} />
        </span>
        <p className="text-section font-bold text-seal-ink">{brand}</p>
        {subtitle && <p className="text-body text-ink-2">{subtitle}</p>}
      </div>

      <Card className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-body">
            <span className="font-medium text-ink">이메일</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="rounded-input border border-line px-3 py-2 text-body text-ink outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-body">
            <span className="font-medium text-ink">비밀번호</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="rounded-input border border-line px-3 py-2 text-body text-ink outline-none focus:border-accent"
            />
          </label>

          {error && <p className="rounded-input bg-crit-soft px-3 py-2 text-body text-crit-ink">{error}</p>}

          <Button type="submit" disabled={isSubmitting} className="mt-1 w-full disabled:opacity-60">
            {isSubmitting ? '로그인 중...' : '로그인'}
          </Button>
        </form>

        {socialLoginHref && <SocialLoginButtons hrefFor={socialLoginHref} label="간편 로그인" />}
      </Card>

      {footer}

      {devHint && <p className="text-chip text-ink-3">{devHint}</p>}
    </div>
  );
};
