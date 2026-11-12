import { Home } from 'lucide-react';
import { Button } from '../Button/Button';
import { Card } from '../Card/Card';
import { TextField } from '../TextField/TextField';
import { AgreementCheckbox, BIRTH_YEAR_MIN, NAME_MAX_LENGTH, todayString } from '../RegisterScreen/registerShared';
import { useOAuthSignupForm } from './useOAuthSignupForm';

const PROVIDER_LABEL = { GOOGLE: '구글', KAKAO: '카카오' };

// 소셜 로그인으로 처음 온 사람의 추가 정보 화면(웹). 이메일은 제공자가 알려 준 값으로 고정이고, 이름은 고칠 수 있다.
// 불러오기·입력·검증·서버 오류 처리는 useOAuthSignupForm 이 한다(앱 MobileOAuthSignupScreen 과 같음).
export const OAuthSignupScreen = ({ brand = 'Butler', subtitle, footer, loadInfo, onSubmit }) => {
  const { info, loadError, values, setValue, fieldErrors, formError, isSubmitting, submit } = useOAuthSignupForm({ loadInfo, onSubmit });

  const handleSubmit = (event) => {
    event.preventDefault();
    submit();
  };

  const header = (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-btn bg-accent text-white">
        <Home size={22} strokeWidth={2.25} />
      </span>
      <p className="text-section font-bold text-seal-ink">{brand}</p>
      {subtitle && <p className="text-body text-ink-2">{subtitle}</p>}
    </div>
  );

  if (loadError || !info) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ground px-6 py-10 font-sans">
        {header}
        <Card className="w-full max-w-sm">
          {loadError ? (
            <p role="alert" className="rounded-input bg-crit-soft px-3 py-2 text-body text-crit-ink">
              {loadError}
            </p>
          ) : (
            <p role="status" className="text-center text-body text-ink-3">
              불러오는 중입니다
            </p>
          )}
        </Card>
        {footer}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ground px-6 py-10 font-sans">
      {header}

      <Card className="w-full max-w-sm">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <p className="rounded-input bg-surface-2 px-3 py-2 text-body text-ink-2">
            {PROVIDER_LABEL[info.provider] ?? '소셜'} 계정으로 로그인했습니다. 가입을 마치려면 아래 정보를 입력해주세요.
          </p>
          <TextField label="이메일" type="email" value={info.email} disabled readOnly hint="소셜 계정의 이메일은 바꿀 수 없습니다" />
          <TextField
            label="이름"
            required
            autoComplete="name"
            value={values.name}
            onChange={setValue('name')}
            error={fieldErrors.name}
            maxLength={NAME_MAX_LENGTH * 2}
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
            <AgreementCheckbox id="oauth-terms" checked={values.termsAgreed} onChange={setValue('termsAgreed')} error={fieldErrors.termsAgreed}>
              <span className="font-semibold text-accent-strong">[필수]</span> 이용약관에 동의합니다
            </AgreementCheckbox>
            <AgreementCheckbox id="oauth-privacy" checked={values.privacyAgreed} onChange={setValue('privacyAgreed')} error={fieldErrors.privacyAgreed}>
              <span className="font-semibold text-accent-strong">[필수]</span> 개인정보 수집·이용에 동의합니다
              <span className="mt-0.5 block text-chip text-ink-3">수집 항목: 이름, 이메일, 생년월일(암호화 저장), 휴대폰 번호(선택, 암호화 저장)</span>
            </AgreementCheckbox>
          </div>

          {formError && (
            <p role="alert" className="rounded-input bg-crit-soft px-3 py-2 text-body text-crit-ink">
              {formError}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting} className="mt-1 w-full disabled:opacity-60">
            {isSubmitting ? '가입 중...' : '가입 완료'}
          </Button>
        </form>
      </Card>

      {footer}
    </div>
  );
};
