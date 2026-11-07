import { useEffect, useState } from 'react';
import { pickFieldErrors, validateProfileFields } from '../RegisterScreen/registerShared';

const FIELD_NAMES = ['name', 'phone', 'birthDate', 'termsAgreed', 'privacyAgreed'];
export const EXPIRED_MESSAGE = '소셜 로그인 시간이 지났습니다. 처음부터 다시 시도해주세요.';

// 소셜 가입 추가정보의 불러오기·입력 상태·검증·서버 오류 처리. 웹(OAuthSignupScreen)과 앱(MobileOAuthSignupScreen)이 같이 쓰고, 모양만 화면이 정한다.
//  loadInfo(): { provider, email, name }을 돌려준다. 로그인 시간이 지났으면 401로 던진다.
//  onSubmit({ name, phone, birthDate, termsAgreed, privacyAgreed }): 가입을 마무리한다.
export const useOAuthSignupForm = ({ loadInfo, onSubmit }) => {
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

  const submit = async () => {
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

  return { info, loadError, values, setValue, fieldErrors, formError, isSubmitting, submit };
};
