import axiosInstance from '../../axios/axiosInstance';

// 인증번호를 확인한다. 맞으면 회원가입(postRegister)에 넘길 { verificationToken, expiresInSeconds }를 받는다.
export const postEmailVerificationConfirm = async ({ email, code }) => {
  const { data } = await axiosInstance.post('/auth/email-verifications/confirm', { email, code });
  return data.data;
};
