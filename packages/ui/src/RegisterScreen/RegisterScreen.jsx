import { useState } from 'react';
import { Home } from 'lucide-react';
import { Button } from '../Button/Button';
import { Card } from '../Card/Card';
import { TextField } from '../TextField/TextField';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^01[016789]\d{7,8}$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72;
const NAME_MAX_LENGTH = 50;
// 서버 details 필드 중 화면 칸과 이름이 같은 것만 칸 아래에 보여 준다.
const FIELD_NAMES = ['name', 'email', 'password', 'phone', 'birthDate', 'termsAgreed', 'privacyAgreed'];
const BIRTH_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BIRTH_YEAR_MIN = 1900;

// 오늘 날짜(YYYY-MM-DD). 기기 시간대 기준이라 date 입력의 max로 쓴다.
const todayString = () => {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

// 서버(registerValidation.js)와 같은 규칙. 최종 판단은 서버가 하고, 여기서는 빠른 안내용이다.
const validate = ({ name, email, password, passwordConfirm, phone, birthDate, termsAgreed, privacyAgreed }) => {
  const errors = {};
  const trimmedName = name.trim();
  if (!trimmedName) errors.name = '이름을 입력해주세요.';
  else if ([...trimmedName].length > NAME_MAX_LENGTH) errors.name = `이름은 ${NAME_MAX_LENGTH}자 이하여야 합니다.`;

  if (!email.trim()) errors.email = '이메일을 입력해주세요.';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = '이메일 형식이 올바르지 않습니다.';

  if (!password) errors.password = '비밀번호를 입력해주세요.';
  else if (password.length < PASSWORD_MIN_LENGTH) errors.password = `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
  else if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) errors.password = '비밀번호가 너무 깁니다. (영문 기준 72자 이하)';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = '비밀번호는 영문과 숫자를 모두 포함해야 합니다.';

  if (!errors.password && password !== passwordConfirm) errors.passwordConfirm = '비밀번호가 일치하지 않습니다.';

  const phoneDigits = phone.replace(/[\s-]/g, '');
  if (phoneDigits && !PHONE_PATTERN.test(phoneDigits)) errors.phone = '휴대폰 번호 형식이 올바르지 않습니다. (예: 010-1234-5678)';

  if (!birthDate) errors.birthDate = '생년월일을 입력해주세요.';
  else if (!BIRTH_DATE_PATTERN.test(birthDate) || Number(birthDate.slice(0, 4)) < BIRTH_YEAR_MIN || birthDate > todayString()) {
    errors.birthDate = '생년월일이 올바르지 않습니다.';
  }

  if (!termsAgreed) errors.termsAgreed = '이용약관에 동의해야 가입할 수 있습니다.';
  if (!privacyAgreed) errors.privacyAgreed = '개인정보 수집·이용에 동의해야 가입할 수 있습니다.';
  return errors;
};

const AgreementCheckbox = ({ id, checked, onChange, error, children }) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2 text-body text-ink">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="mt-1 h-4 w-4 shrink-0 accent-accent"
      />
      <span>{children}</span>
    </label>
    {error && (
      <p id={`${id}-error`} className="pl-6 text-chip text-crit-ink">
        {error}
      </p>
    )}
  </div>
);

// 회원가입 화면. onSubmit({ name, email, password, phone, birthDate, termsAgreed, privacyAgreed })이 던진 오류의
// error.response.data.error(code, message, details)를 칸별 오류와 위쪽 안내로 나눠 보여 준다.
export const RegisterScreen = ({ brand = 'Butler', subtitle, footer, onSubmit }) => {
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

  const setValue = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setValues((current) => ({ ...current, [field]: value }));
    // 고치기 시작한 칸의 오류는 바로 지운다(다시 제출하면 다시 검사).
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const errors = validate(values);
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
      });
    } catch (submitError) {
      const apiError = submitError?.response?.data?.error;
      const serverFieldErrors = {};
      for (const { field, reason } of apiError?.details ?? []) {
        if (FIELD_NAMES.includes(field) && !serverFieldErrors[field]) serverFieldErrors[field] = reason;
      }
      if (apiError?.code === 'EMAIL_ALREADY_EXISTS') serverFieldErrors.email = apiError.message;

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
          <TextField
            label="이메일"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={values.email}
            onChange={setValue('email')}
            error={fieldErrors.email}
          />
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
      </Card>

      {footer}
    </div>
  );
};
