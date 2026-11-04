import { useEffect, useState } from 'react';
import { Home } from 'lucide-react';
import { Button } from '../Button/Button';
import { Card } from '../Card/Card';
import { TextField } from '../TextField/TextField';
import {
  AgreementCheckbox,
  BIRTH_YEAR_MIN,
  NAME_MAX_LENGTH,
  pickFieldErrors,
  todayString,
  validateProfileFields,
} from '../RegisterScreen/registerShared';

const FIELD_NAMES = ['name', 'phone', 'birthDate', 'termsAgreed', 'privacyAgreed'];
const PROVIDER_LABEL = { GOOGLE: '구글', KAKAO: '카카오' };
const EXPIRED_MESSAGE = '소셜 로그인 시간이 지났습니다. 처음부터 다시 시도해주세요.';

// 소셜 로그인으로 처음 온 사람의 추가 정보 화면. 이메일은 제공자가 알려 준 값으로 고정이고, 이름은 고칠 수 있다.
//  loadInfo(): { provider, email, name }을 돌려준다. 로그인 시간이 지났으면 401로 던진다.
//  onSubmit({ name, phone, birthDate, termsAgreed, privacyAgreed }): 가입을 마무리한다.
// 두 함수가 던진 오류의 error.response.data.error(code, message, details)를 칸별 오류와 위쪽 안내로 나눠 보여 준다.
export const OAuthSignupScreen = ({ brand = 'Butler', subtitle, footer, loadInfo, onSubmit }) => {
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [values, setValues] = useState({ name: '', birthDate: '', phone: '', termsAgreed: false, privacyAgreed: false });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isActive = true;
    loadInfo()
      .then((result) => {
        if (!isActive) return;
        setInfo(result);
        setValues((current) => ({ ...current, name: result.name ?? '' }));
      })
      .catch((error) => {
        if (!isActive) return;
        const apiError = error?.response?.data?.error;
        setLoadError(apiError?.code === 'OAUTH_SIGNUP_EXPIRED' ? EXPIRED_MESSAGE : (apiError?.message ?? '정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'));
      });
    return () => {
      isActive = false;
    };
    // loadInfo는 부모가 매 렌더 새로 만들 수 있어 의존성에 넣지 않는다(화면을 열 때 한 번만 부른다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setValue = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const errors = validateProfileFields(values);
    setFieldErrors(errors);
    setFormError('');
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: values.name.trim(),
        phone: values.phone.trim() || null,
        birthDate: values.birthDate,
        termsAgreed: values.termsAgreed,
        privacyAgreed: values.privacyAgreed,
      });
    } catch (submitError) {
      const apiError = submitError?.response?.data?.error;
      if (apiError?.code === 'OAUTH_SIGNUP_EXPIRED') {
        setLoadError(EXPIRED_MESSAGE);
        return;
      }
      const serverFieldErrors = pickFieldErrors(apiError?.details, FIELD_NAMES);
      setFieldErrors(serverFieldErrors);
      if (Object.keys(serverFieldErrors).length === 0) {
        setFormError(apiError?.message ?? '가입에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setIsSubmitting(false);
    }
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
