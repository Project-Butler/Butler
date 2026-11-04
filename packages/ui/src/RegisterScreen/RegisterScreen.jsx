import { useEffect, useState } from 'react';
import { Home } from 'lucide-react';
import { Button } from '../Button/Button';
import { Card } from '../Card/Card';
import { TextField } from '../TextField/TextField';
import { AgreementCheckbox, BIRTH_YEAR_MIN, NAME_MAX_LENGTH, pickFieldErrors, todayString, validateProfileFields } from './registerShared';
import { SocialLoginButtons } from '../SocialLoginButtons/SocialLoginButtons';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72;
// 서버 details 필드 중 화면 칸과 이름이 같은 것만 칸 아래에 보여 준다.
const FIELD_NAMES = ['name', 'email', 'password', 'phone', 'birthDate', 'termsAgreed', 'privacyAgreed'];
const CODE_PATTERN = /^\d{6}$/;

// 서버(registerValidation.js)와 같은 규칙. 최종 판단은 서버가 하고, 여기서는 빠른 안내용이다.
const validate = ({ name, email, password, passwordConfirm, phone, birthDate, termsAgreed, privacyAgreed }, isEmailVerified) => {
  const errors = validateProfileFields({ name, phone, birthDate, termsAgreed, privacyAgreed });

  if (!email.trim()) errors.email = '이메일을 입력해주세요.';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = '이메일 형식이 올바르지 않습니다.';
  else if (!isEmailVerified) errors.email = '이메일 인증을 완료해주세요.';

  if (!password) errors.password = '비밀번호를 입력해주세요.';
  else if (password.length < PASSWORD_MIN_LENGTH) errors.password = `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
  else if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) errors.password = '비밀번호가 너무 깁니다. (영문 기준 72자 이하)';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = '비밀번호는 영문과 숫자를 모두 포함해야 합니다.';

  if (!errors.password && password !== passwordConfirm) errors.passwordConfirm = '비밀번호가 일치하지 않습니다.';
  return errors;
};

// 회원가입 화면. 이메일은 인증번호를 확인한 뒤에만 가입할 수 있다.
//  onRequestEmailCode(email): 인증번호를 보내고 { resendAfterSeconds }를 돌려준다.
//  onConfirmEmailCode(email, code): 번호를 확인하고 { verificationToken }을 돌려준다.
//  onSubmit({ name, email, password, phone, birthDate, termsAgreed, privacyAgreed, emailVerificationToken })
//  socialLoginHref(provider): 있으면 폼 아래에 구글·카카오로 시작하는 링크를 보여 준다.
// 세 함수가 던진 오류의 error.response.data.error(code, message, details)를 칸별 오류와 위쪽 안내로 나눠 보여 준다.
export const RegisterScreen = ({
  brand = 'Butler',
  subtitle,
  footer,
  onSubmit,
  onRequestEmailCode,
  onConfirmEmailCode,
  socialLoginHref,
}) => {
  const [values, setValues] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirm: '',
    phone: '',
    birthDate: '',
    termsAgreed: false,
    privacyAgreed: false,
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 이메일 인증: idle(번호 요청 전) → sent(번호 입력 중) → verified(가입 가능). 이메일을 고치면 idle로 돌아간다.
  const [emailStep, setEmailStep] = useState('idle');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isEmailBusy, setIsEmailBusy] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = setTimeout(() => setResendSeconds((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  const resetEmailVerification = () => {
    setEmailStep('idle');
    setVerifiedEmail('');
    setVerificationToken('');
    setCode('');
    setCodeError('');
    setResendSeconds(0);
  };

  const setValue = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setValues((current) => ({ ...current, [field]: value }));
    // 고치기 시작한 칸의 오류는 바로 지운다(다시 제출하면 다시 검사).
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const handleEmailChange = (event) => {
    setValue('email')(event);
    // 인증번호를 보낸 이메일과 달라지면 인증을 처음부터 다시 받는다.
    if (emailStep !== 'idle' && event.target.value.trim() !== verifiedEmail) resetEmailVerification();
  };

  const showEmailError = (requestError, fallback) => {
    const apiError = requestError?.response?.data?.error;
    const detail = apiError?.details?.find((item) => item.field === 'email')?.reason;
    setFieldErrors((current) => ({ ...current, email: detail ?? apiError?.message ?? fallback }));
  };

  const handleRequestCode = async () => {
    if (isEmailBusy || resendSeconds > 0) return;
    const email = values.email.trim();
    if (!email || !EMAIL_PATTERN.test(email)) {
      setFieldErrors((current) => ({ ...current, email: email ? '이메일 형식이 올바르지 않습니다.' : '이메일을 입력해주세요.' }));
      return;
    }

    setIsEmailBusy(true);
    setFieldErrors((current) => ({ ...current, email: undefined }));
    setCodeError('');
    try {
      const result = await onRequestEmailCode(email);
      setVerifiedEmail(email);
      setEmailStep('sent');
      setCode('');
      setResendSeconds(result?.resendAfterSeconds ?? 60);
    } catch (requestError) {
      showEmailError(requestError, '인증번호를 보내지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsEmailBusy(false);
    }
  };

  const handleConfirmCode = async () => {
    if (isEmailBusy) return;
    if (!CODE_PATTERN.test(code)) {
      setCodeError('인증번호 6자리를 입력해주세요.');
      return;
    }

    setIsEmailBusy(true);
    setCodeError('');
    try {
      const result = await onConfirmEmailCode(verifiedEmail, code);
      setVerificationToken(result.verificationToken);
      setEmailStep('verified');
      setResendSeconds(0);
      setFieldErrors((current) => ({ ...current, email: undefined }));
    } catch (confirmError) {
      const apiError = confirmError?.response?.data?.error;
      setCodeError(apiError?.message ?? '인증번호를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsEmailBusy(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const errors = validate(values, emailStep === 'verified');
    setFieldErrors(errors);
    setFormError('');
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        phone: values.phone.trim() || null,
        birthDate: values.birthDate,
        termsAgreed: values.termsAgreed,
        privacyAgreed: values.privacyAgreed,
        emailVerificationToken: verificationToken,
      });
    } catch (submitError) {
      const apiError = submitError?.response?.data?.error;
      const serverFieldErrors = pickFieldErrors(apiError?.details, FIELD_NAMES);
      if (apiError?.code === 'EMAIL_ALREADY_EXISTS') serverFieldErrors.email = apiError.message;
      // 인증이 만료됐거나 이미 쓴 토큰이면 인증을 처음부터 다시 받게 한다.
      if (apiError?.code === 'EMAIL_NOT_VERIFIED') {
        serverFieldErrors.email = apiError.message;
        resetEmailVerification();
      }

      setFieldErrors(serverFieldErrors);
      // 칸에 붙일 수 없는 오류(요청 한도, 서버 오류, 네트워크 등)만 위쪽에 보여 준다.
      if (Object.keys(serverFieldErrors).length === 0) {
        setFormError(apiError?.message ?? '회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setIsSubmitting(false);
    }
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
              onChange={handleEmailChange}
              error={fieldErrors.email}
              disabled={emailStep === 'verified'}
              suffix={emailStep === 'verified' ? <span className="font-semibold text-accent-strong">인증 완료</span> : undefined}
            />
            {emailStep === 'verified' ? (
              <Button variant="secondary" size="sm" onClick={resetEmailVerification} className="self-start">
                이메일 변경
              </Button>
            ) : (
              <Button variant="secondary" size="sm" disabled={isEmailBusy || resendSeconds > 0} onClick={handleRequestCode} className="self-start">
                {resendSeconds > 0 ? `인증번호 다시 받기 (${resendSeconds}초)` : emailStep === 'sent' ? '인증번호 다시 받기' : '인증번호 받기'}
              </Button>
            )}
            {emailStep === 'sent' && (
              <div className="flex items-start gap-2">
                <TextField
                  className="flex-1"
                  aria-label="인증번호"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="인증번호 6자리"
                  maxLength={6}
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value.replace(/\D/g, ''));
                    setCodeError('');
                  }}
                  error={codeError}
                  hint={codeError ? undefined : '메일로 받은 6자리 번호를 3분 안에 입력해주세요'}
                />
                <Button disabled={isEmailBusy || code.length !== 6} onClick={handleConfirmCode} className="h-12 shrink-0">
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
