import { useState } from 'react';
import { Button } from '../Button/Button';
import { useLoginForm } from '../LoginScreen/useLoginForm';
import { SocialLoginButtons } from '../SocialLoginButtons/SocialLoginButtons';
import { TextField } from '../TextField/TextField';
import eyeIcon from './assets/icon-eye.svg';
import lockIcon from './assets/icon-lock.svg';
import logoMark from './assets/logo-mark-44.svg';

// 앱 로그인 화면 (Figma M01 / 로그인, 3:11). 입력·제출은 웹 LoginScreen 과 같은 useLoginForm 이고 모양만 다르다.
// Figma 의 "비밀번호 찾기"는 연결할 API 가 없어 두지 않는다. 소셜 로그인은 웹과 같은 링크를 카드 아래쪽에 둔다.
// 칸에 필수 표시(*)는 붙이지 않는다(Figma 와 같음, 웹 로그인도 없음). footer: 카드 안 [로그인] 아래 줄(회원가입 링크). devHint: 개발 서버에서만 넘기는 확인용 계정 안내.
export const MobileLoginScreen = ({ brand = 'Butler', devHint, footer, onSubmit, initialError = '', socialLoginHref }) => {
  const { email, setEmail, password, setPassword, error, isSubmitting, handleSubmit } = useLoginForm({ onSubmit, initialError });
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col gap-6 bg-ground px-5 pb-8 pt-16 font-sans text-ink md:border-x md:border-line">
      <div className="flex items-center gap-2">
        <img src={logoMark} alt="" width={44} height={44} />
        <p className="text-m-h1 font-semibold text-ink">{brand}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-page font-bold text-ink">
          집의 기록을
          <br />
          한곳에서 관리하세요
        </h1>
        <p className="text-body text-ink-2">임대인을 위한 내 부동산 관리 공간</p>
      </div>

      <div className="rounded-card border border-line bg-surface p-5">
        <form aria-label="로그인" onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <TextField
            mobile
            label="이메일"
            type="email"
            autoComplete="email"
            placeholder="owner@butler.kr"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            mobile
            label="비밀번호"
            type={isPasswordVisible ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            suffix={
              <button
                type="button"
                aria-label="비밀번호 보기"
                aria-pressed={isPasswordVisible}
                onClick={() => setIsPasswordVisible((current) => !current)}
                className="flex h-8 w-8 items-center justify-center"
              >
                <img src={eyeIcon} alt="" width={18} height={18} />
              </button>
            }
          />

          {error && (
            <p role="alert" className="rounded-input bg-crit-soft px-3 py-2 text-body text-crit-ink">
              {error}
            </p>
          )}

          <Button type="submit" size="h48" disabled={isSubmitting} className="w-full">
            {isSubmitting ? '로그인 중...' : '로그인'}
          </Button>

          {footer && <div className="flex items-center justify-center gap-3 text-m-label font-semibold">{footer}</div>}
        </form>

        {socialLoginHref && <SocialLoginButtons hrefFor={socialLoginHref} label="간편 로그인" />}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-m-sub text-ink-3">
        <img src={lockIcon} alt="" width={14} height={14} />
        주민등록번호는 받지 않습니다
      </p>

      {devHint && <p className="break-all text-center text-chip text-ink-3">{devHint}</p>}
    </div>
  );
};
