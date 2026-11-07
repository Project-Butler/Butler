import { useState } from 'react';

// 로그인 입력 상태·제출·오류 문구. 웹(LoginScreen)과 앱(MobileLoginScreen)이 같이 쓰고, 모양만 화면이 정한다.
// initialError: 화면을 열 때 바로 보여 줄 오류(소셜 로그인 실패 등). 처음 마운트될 때 한 번만 읽는다.
export const useLoginForm = ({ onSubmit, initialError = '' }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError('');
    setIsSubmitting(true);
    try {
      await onSubmit({ email, password });
    } catch (submitError) {
      setError(submitError?.response?.data?.error?.message ?? '로그인에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return { email, setEmail, password, setPassword, error, isSubmitting, handleSubmit };
};
