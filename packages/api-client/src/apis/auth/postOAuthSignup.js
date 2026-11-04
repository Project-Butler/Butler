import axiosInstance from '../../axios/axiosInstance';

// 추가 정보를 받아 소셜 가입을 마무리한다. 가입 직후 로그인 상태가 되고(쿠키 발급) 응답은 postRegister와 같은 AuthMe 모양.
export const postOAuthSignup = async ({ name, phone, birthDate, termsAgreed, privacyAgreed }) => {
  const { data } = await axiosInstance.post('/auth/oauth/signup', { name, phone, birthDate, termsAgreed, privacyAgreed });
  return data.data;
};
