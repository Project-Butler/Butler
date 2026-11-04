// 일반 가입(RegisterScreen)과 소셜 가입(OAuthSignupScreen)이 같이 쓰는 입력 규칙과 약관 체크박스.
// 규칙은 서버(registerValidation.js)와 같다. 최종 판단은 서버가 하고, 여기서는 빠른 안내용이다.

export const PHONE_PATTERN = /^01[016789]\d{7,8}$/;
export const NAME_MAX_LENGTH = 50;
export const BIRTH_YEAR_MIN = 1900;
const BIRTH_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 오늘 날짜(YYYY-MM-DD). 기기 시간대 기준이라 date 입력의 max로 쓴다.
export const todayString = () => {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

// 이름·휴대폰(선택)·생년월일·약관 동의의 오류를 { 칸이름: 문구 }로 돌려준다.
export const validateProfileFields = ({ name, phone, birthDate, termsAgreed, privacyAgreed }) => {
  const errors = {};

  const trimmedName = name.trim();
  if (!trimmedName) errors.name = '이름을 입력해주세요.';
  else if ([...trimmedName].length > NAME_MAX_LENGTH) errors.name = `이름은 ${NAME_MAX_LENGTH}자 이하여야 합니다.`;

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

// 서버가 돌려준 details 중 화면 칸과 이름이 같은 것만 { 칸이름: 문구 }로 모은다.
export const pickFieldErrors = (details, fieldNames) => {
  const result = {};
  for (const { field, reason } of details ?? []) {
    if (fieldNames.includes(field) && !result[field]) result[field] = reason;
  }
  return result;
};

export const AgreementCheckbox = ({ id, checked, onChange, error, children }) => (
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
