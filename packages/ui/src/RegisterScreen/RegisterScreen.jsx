import { Home } from 'lucide-react';
import { Button } from '../Button/Button';
import { Card } from '../Card/Card';
import { TextField } from '../TextField/TextField';
import { AgreementCheckbox, BIRTH_YEAR_MIN, NAME_MAX_LENGTH, todayString } from './registerShared';
import { useRegisterForm } from './useRegisterForm';
import { SocialLoginButtons } from '../SocialLoginButtons/SocialLoginButtons';

// 회원가입 화면(웹). 입력 상태·이메일 인증·검증·서버 오류 처리는 useRegisterForm 이 한다(앱 MobileRegisterScreen 과 같음).
// 이메일은 인증번호를 확인한 뒤에만 가입할 수 있다. onSubmit·onRequestEmailCode·onConfirmEmailCode 는 useRegisterForm 참고.
//  socialLoginHref(provider): 있으면 폼 아래에 구글·카카오로 시작하는 링크를 보여 준다.
export const RegisterScreen = ({
  brand = 'Butler',
  subtitle,
  footer,
  onSubmit,
  onRequestEmailCode,
  onConfirmEmailCode,
  socialLoginHref,
}) => {
  const { values, setValue, fieldErrors, formError, isSubmitting, submit, email } = useRegisterForm({
    onSubmit,
    onRequestEmailCode,
    onConfirmEmailCode,
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    submit();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ground px-6 py-10 font-sans">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-btn bg-accent text-white">
          <Home size={22} strokeWidth={2.25} />
        </span>
        <p className="text-section font-bold text-seal-ink">{brand}</p>
        {subtitle && <p className="text-body text-ink-2">{subtitle}</p>}
      </div>

      <Card className="w-full max-w-sm">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <TextField
            label="이름"
            required
            autoComplete="name"
            value={values.name}
            onChange={setValue('name')}
            error={fieldErrors.name}
            maxLength={NAME_MAX_LENGTH * 2}
          />
          <div className="flex flex-col gap-2">
            <TextField
              label="이메일"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={values.email}
              onChange={email.onChange}
              error={fieldErrors.email}
              disabled={email.step === 'verified'}
              suffix={email.step === 'verified' ? <span className="font-semibold text-accent-strong">인증 완료</span> : undefined}
            />
            {email.step === 'verified' ? (
              <Button variant="secondary" size="sm" onClick={email.reset} className="self-start">
                이메일 변경
              </Button>
            ) : (
              <Button variant="secondary" size="sm" disabled={email.isBusy || email.resendSeconds > 0} onClick={email.requestCode} className="self-start">
                {email.resendSeconds > 0 ? `인증번호 다시 받기 (${email.resendSeconds}초)` : email.step === 'sent' ? '인증번호 다시 받기' : '인증번호 받기'}
              </Button>
            )}
            {email.step === 'sent' && (
              <div className="flex items-start gap-2">
                <TextField
                  className="flex-1"
                  aria-label="인증번호"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="인증번호 6자리"
                  maxLength={6}
                  value={email.code}
                  onChange={email.onCodeChange}
                  error={email.codeError}
                  hint={email.codeError ? undefined : '메일로 받은 6자리 번호를 3분 안에 입력해주세요'}
                />
                <Button disabled={email.isBusy || email.code.length !== 6} onClick={email.confirmCode} className="h-12 shrink-0">
                  확인
                </Button>
              </div>
            )}
          </div>
          <TextField
            label="비밀번호"
            type="password"
            required
            autoComplete="new-password"
            hint="영문과 숫자를 포함해 8자 이상"
            value={values.password}
            onChange={setValue('password')}
            error={fieldErrors.password}
          />
          <TextField
            label="비밀번호 확인"
            type="password"
            required
            autoComplete="new-password"
            value={values.passwordConfirm}
            onChange={setValue('passwordConfirm')}
            error={fieldErrors.passwordConfirm}
          />
          <TextField
            label="생년월일"
            type="date"
            required
            autoComplete="bday"
            hint="소유주 인증에 사용합니다"
            min={`${BIRTH_YEAR_MIN}-01-01`}
            max={todayString()}
            value={values.birthDate}
            onChange={setValue('birthDate')}
            error={fieldErrors.birthDate}
          />
          <TextField
            label="휴대폰 번호 (선택)"
            type="tel"
            autoComplete="tel"
            placeholder="010-1234-5678"
            value={values.phone}
            onChange={setValue('phone')}
            error={fieldErrors.phone}
          />

          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <AgreementCheckbox
              id="register-terms"
              checked={values.termsAgreed}
              onChange={setValue('termsAgreed')}
              error={fieldErrors.termsAgreed}
            >
              <span className="font-semibold text-accent-strong">[필수]</span> 이용약관에 동의합니다
            </AgreementCheckbox>
            <AgreementCheckbox
              id="register-privacy"
              checked={values.privacyAgreed}
              onChange={setValue('privacyAgreed')}
              error={fieldErrors.privacyAgreed}
            >
              <span className="font-semibold text-accent-strong">[필수]</span> 개인정보 수집·이용에 동의합니다
              <span className="mt-0.5 block text-chip text-ink-3">수집 항목: 이름, 이메일, 비밀번호(암호화 저장), 생년월일(암호화 저장), 휴대폰 번호(선택, 암호화 저장)</span>
            </AgreementCheckbox>
          </div>

          {formError && (
            <p role="alert" className="rounded-input bg-crit-soft px-3 py-2 text-body text-crit-ink">
              {formError}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting} className="mt-1 w-full disabled:opacity-60">
            {isSubmitting ? '가입 중...' : '회원가입'}
          </Button>
        </form>

        {socialLoginHref && <SocialLoginButtons hrefFor={socialLoginHref} label="간편 가입" />}
      </Card>

      {footer}
    </div>
  );
};
