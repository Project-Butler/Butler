import axiosInstance from '../../axios/axiosInstance';

// 가입 직후 로그인 상태가 된다(쿠키 발급). 응답은 postLogin과 같은 AuthMe 모양.
// invitationToken이 있으면 서버가 role을 TENANT로 정하고 초대를 함께 수락한다(본인 확인 세션 필요).
// emailVerificationToken은 postEmailVerificationConfirm이 준 값이다(그 이메일로 인증을 마쳐야 가입된다).
export const postRegister = async ({
  email,
  password,
  name,
  phone,
  birthDate,
  role,
  termsAgreed,
  privacyAgreed,
  emailVerificationToken,
  invitationToken,
}) => {
  const { data } = await axiosInstance.post('/auth/register', {
    email,
    password,
    name,
    phone,
    birthDate,
    role,
    termsAgreed,
    privacyAgreed,
    emailVerificationToken,
    invitationToken,
  });
  return data.data;
};
