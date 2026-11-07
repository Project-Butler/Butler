import { useEffect, useState } from 'react';
import { pickFieldErrors, validateProfileFields } from './registerShared';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72;
// 서버 details 필드 중 화면 칸과 이름이 같은 것만 칸 아래에 보여 준다.
const FIELD_NAMES = ['name', 'email', 'password', 'phone', 'birthDate', 'termsAgreed', 'privacyAgreed'];
const CODE_PATTERN = /^\d{6}$/;

const EMPTY_VALUES = {
  name: '',
  email: '',
  password: '',
  passwordConfirm: '',
  phone: '',
  birthDate: '',
  termsAgreed: false,
  privacyAgreed: false,
};

// 서버(registerValidation.js)와 같은 규칙. 최종 판단은 서버가 하고, 여기서는 빠른 안내용이다.
export const validateRegister = ({ name, email, password, passwordConfirm, phone, birthDate, termsAgreed, privacyAgreed }, isEmailVerified) => {
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

// 회원가입 입력 상태·이메일 인증·검증·서버 오류 처리. 웹(RegisterScreen)과 앱(MobileRegisterScreen)이 같이 쓰고, 모양만 화면이 정한다.
//  onRequestEmailCode(email): 인증번호를 보내고 { resendAfterSeconds }를 돌려준다.
//  onConfirmEmailCode(email, code): 번호를 확인하고 { verificationToken }을 돌려준다.
//  onSubmit({ name, email, password, phone, birthDate, termsAgreed, privacyAgreed, emailVerificationToken })
// 세 함수가 던진 오류의 error.response.data.error(code, message, details)를 칸별 오류(fieldErrors)와 위쪽 안내(formError)로 나눈다.
export const useRegisterForm = ({ onSubmit, onRequestEmailCode, onConfirmEmailCode }) => {
  const [values, setValues] = useState(EMPTY_VALUES);
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

  const handleCodeChange = (event) => {
    setCode(event.target.value.replace(/\D/g, ''));
    setCodeError('');
  };

  const showEmailError = (requestError, fallback) => {
    const apiError = requestError?.response?.data?.error;
    const detail = apiError?.details?.find((item) => item.field === 'email')?.reason;
    setFieldErrors((current) => ({ ...current, email: detail ?? apiError?.message ?? fallback }));
  };

  const requestEmailCode = async () => {
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

  const confirmEmailCode = async () => {
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

  // 앱 1단계처럼 일부 칸만 검사할 때. 그 칸들의 오류만 바꾸고, 오류가 없으면 true.
  const checkFields = (fields) => {
    const errors = validateRegister(values, emailStep === 'verified');
    const picked = Object.fromEntries(fields.map((field) => [field, errors[field]]));
    setFieldErrors((current) => ({ ...current, ...picked }));
    return fields.every((field) => !errors[field]);
  };

  // 전체를 검사하고 보낸다. 끝난 뒤 칸별 오류({ 칸이름: 문구 }, 성공이면 빈 객체)를 돌려준다 — 앱은 이것으로 돌아갈 단계를 고른다.
  const submit = async () => {
    if (isSubmitting) return null;

    const errors = validateRegister(values, emailStep === 'verified');
    setFieldErrors(errors);
    setFormError('');
    if (Object.keys(errors).length > 0) return errors;

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
      return {};
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
      return serverFieldErrors;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    values,
    setValue,
    fieldErrors,
    formError,
    isSubmitting,
    checkFields,
    submit,
    email: {
      step: emailStep,
      code,
      codeError,
      isBusy: isEmailBusy,
      resendSeconds,
      onChange: handleEmailChange,
      onCodeChange: handleCodeChange,
      requestCode: requestEmailCode,
      confirmCode: confirmEmailCode,
      reset: resetEmailVerification,
    },
  };
};
