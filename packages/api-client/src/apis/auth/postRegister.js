import axiosInstance from '../../axios/axiosInstance';

// 가입 직후 로그인 상태가 된다(쿠키 발급). 응답은 postLogin과 같은 AuthMe 모양.
export const postRegister = async ({ email, password, name, phone, birthDate, role, termsAgreed, privacyAgreed }) => {
  const { data } = await axiosInstance.post('/auth/register', {
    email,
    password,
    name,
    phone,
    birthDate,
    role,
    termsAgreed,
    privacyAgreed,
  });
  return data.data;
};
