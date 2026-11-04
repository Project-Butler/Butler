import axiosInstance from '../../axios/axiosInstance';

// 가입하려는 이메일로 인증번호를 보낸다. { expiresInSeconds, resendAfterSeconds }
export const postEmailVerification = async ({ email }) => {
  const { data } = await axiosInstance.post('/auth/email-verifications', { email });
  return data.data;
};
