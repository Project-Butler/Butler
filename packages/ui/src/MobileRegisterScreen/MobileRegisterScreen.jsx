import { Fragment, useState } from 'react';
import { Button } from '../Button/Button';
import { MobileFormLayout } from '../MobileShell/MobileFormLayout';
import { BIRTH_YEAR_MIN, NAME_MAX_LENGTH, todayString } from '../RegisterScreen/registerShared';
import { useRegisterForm } from '../RegisterScreen/useRegisterForm';
import { SocialLoginButtons } from '../SocialLoginButtons/SocialLoginButtons';
import { TextField } from '../TextField/TextField';
import { AgreementRow } from './AgreementRow';

// 1단계(계정) 칸. 서버가 이 칸들의 오류를 돌려주면 1단계로 돌아가 보여 준다. 나머지(생년월일·휴대폰·약관)는 2단계다.
const ACCOUNT_FIELDS = ['name', 'email', 'password', 'passwordConfirm'];

const StepHeading = ({ title, description }) => (
  <div className="flex flex-col gap-1.5">
    <h2 className="text-page-sm font-bold text-ink">{title}</h2>
    <p className="text-body text-ink-2">{description}</p>
  </div>
);

// 앱 회원가입 화면 (Figma M02 / 회원가입, 3:49). 웹 RegisterScreen 과 같은 입력 항목·규칙·API(useRegisterForm)를 두 단계로 나눠 보여 준다.
//  1단계 계정: 이름 · 이메일 + 인증번호 · 비밀번호 · 비밀번호 확인 (+ 소셜 가입)
//  2단계 본인 정보: 생년월일 · 휴대폰(선택) · 필수 약관 2개
// Figma 에 있지만 API 가 없는 것(휴대폰 "인증번호 받기", [선택] 일정·알림 수신, 약관 상세 >)은 두지 않는다.
// onBack: 1단계에서 뒤로 가기를 눌렀을 때(로그인 화면으로). 2단계의 뒤로 가기는 1단계로 돌아간다.
export const MobileRegisterScreen = ({ onSubmit, onRequestEmailCode, onConfirmEmailCode, socialLoginHref, onBack, footer }) => {
  const { values, setValue, fieldErrors, formError, isSubmitting, checkFields, submit, email } = useRegisterForm({
    onSubmit,
    onRequestEmailCode,
    onConfirmEmailCode,
  });
  const [step, setStep] = useState(1);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (step === 1) {
      if (checkFields(ACCOUNT_FIELDS)) setStep(2);
      return;
    }
    const errors = await submit();
    if (errors && ACCOUNT_FIELDS.some((field) => errors[field])) setStep(1);
  };

  const isVerified = email.step === 'verified';

  return (
    <MobileFormLayout
      shell="register-app"
      topBar={{ title: '회원가입', step: `${step} / 2`, onBack: step === 2 ? () => setStep(1) : onBack }}
      onSubmit={handleSubmit}
      cta={
        <Button type="submit" size="h52" disabled={isSubmitting} className="flex-1">
          {step === 1 ? '다음 · 본인 확인' : isSubmitting ? '가입 중...' : '가입하기'}
        </Button>
      }
    >
      {/* 단계마다 key 를 달리해 입력 칸을 새로 만든다(같은 자리의 칸을 재사용하면 이름 칸이 생년월일 칸으로 바뀌며 값·자동 완성이 섞인다) */}
      {step === 1 ? (
        <Fragment key="account">
          <StepHeading title="계정 만들기" description="임대인 계정으로 가입합니다" />
          <TextField
            mobile
            label="이름"
            required
            autoComplete="name"
            placeholder="홍길동"
            value={values.name}
            onChange={setValue('name')}
            error={fieldErrors.name}
            maxLength={NAME_MAX_LENGTH * 2}
          />
          <div className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <TextField
                mobile
                className="min-w-0 flex-1"
                label="이메일"
                type="email"
                required
                autoComplete="email"
                placeholder="owner@butler.kr"
                value={values.email}
                onChange={email.onChange}
                disabled={isVerified}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? 'register-app-email-error' : undefined}
                suffix={isVerified ? <span className="font-semibold text-accent-strong">인증 완료</span> : undefined}
              />
              {isVerified ? (
                <Button variant="secondary" size="h48" onClick={email.reset} className="shrink-0">
                  이메일 변경
                </Button>
              ) : (
                <Button variant="secondary" size="h48" disabled={email.isBusy || email.resendSeconds > 0} onClick={email.requestCode} className="shrink-0">
                  {email.resendSeconds > 0 ? `다시 받기 ${email.resendSeconds}초` : email.step === 'sent' ? '다시 받기' : '인증번호 받기'}
                </Button>
              )}
            </div>
            {/* 칸 아래 오류는 버튼 줄 밖에 둬야 칸과 버튼의 높이가 어긋나지 않는다 */}
            {fieldErrors.email && (
              <p id="register-app-email-error" className="text-m-sub text-crit-ink">
                {fieldErrors.email}
              </p>
            )}
            {email.step === 'sent' && (
              <div className="flex items-start gap-2">
                <TextField
                  mobile
                  className="min-w-0 flex-1"
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
                <Button size="h48" disabled={email.isBusy || email.code.length !== 6} onClick={email.confirmCode} className="shrink-0">
                  확인
                </Button>
              </div>
            )}
          </div>
          <TextField
            mobile
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
            mobile
            label="비밀번호 확인"
            type="password"
            required
            autoComplete="new-password"
            value={values.passwordConfirm}
            onChange={setValue('passwordConfirm')}
            error={fieldErrors.passwordConfirm}
          />
          {socialLoginHref && <SocialLoginButtons hrefFor={socialLoginHref} label="간편 가입" />}
          {footer}
        </Fragment>
      ) : (
        <Fragment key="profile">
          <StepHeading title="본인 정보" description="생년월일은 권리자 인증에 사용합니다" />
          <TextField
            mobile
            label="생년월일"
            type="date"
            required
            autoComplete="bday"
            min={`${BIRTH_YEAR_MIN}-01-01`}
            max={todayString()}
            value={values.birthDate}
            onChange={setValue('birthDate')}
            error={fieldErrors.birthDate}
          />
          <TextField
            mobile
            label="휴대폰 (선택)"
            type="tel"
            autoComplete="tel"
            placeholder="010-1234-5678"
            value={values.phone}
            onChange={setValue('phone')}
            error={fieldErrors.phone}
          />
          <div className="rounded-card border border-line bg-surface px-4 py-1">
            <AgreementRow id="register-app-terms" checked={values.termsAgreed} onChange={setValue('termsAgreed')} error={fieldErrors.termsAgreed}>
              [필수] 이용약관 동의
            </AgreementRow>
            <AgreementRow id="register-app-privacy" checked={values.privacyAgreed} onChange={setValue('privacyAgreed')} error={fieldErrors.privacyAgreed}>
              [필수] 개인정보 수집·이용 동의
              <span className="mt-0.5 block text-chip text-ink-3">수집 항목: 이름, 이메일, 비밀번호(암호화 저장), 생년월일(암호화 저장), 휴대폰 번호(선택, 암호화 저장)</span>
            </AgreementRow>
          </div>
          <p className="rounded-btn bg-surface-2 px-3.5 py-3 text-m-sub text-ink-2">주민등록번호는 받지 않습니다. 생년월일과 휴대폰 번호는 암호화해 보관합니다.</p>
        </Fragment>
      )}

      {formError && (
        <p role="alert" className="rounded-input bg-crit-soft px-3 py-2 text-body text-crit-ink">
          {formError}
        </p>
      )}
    </MobileFormLayout>
  );
};
