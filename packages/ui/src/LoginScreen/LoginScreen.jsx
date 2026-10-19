import { useState } from 'react';
import { Home } from 'lucide-react';
import { Button } from '../Button/Button';
import { Card } from '../Card/Card';

export const LoginScreen = ({ brand = 'Butler', subtitle, devHint, onSubmit }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError('');
    setIsSubmitting(true);
    try {
      await onSubmit({ email, password });
    } catch (submitError) {
      setError(submitError?.response?.data?.error?.message ?? '로그인에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
      </Card>

      {devHint && <p className="text-chip text-ink-3">{devHint}</p>}
    </div>
  );
};
