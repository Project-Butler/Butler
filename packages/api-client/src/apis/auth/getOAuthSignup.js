import axiosInstance from '../../axios/axiosInstance';

// 소셜 로그인으로 처음 온 사람의 { provider, email, name }. 로그인 시간이 지났으면 401 OAUTH_SIGNUP_EXPIRED.
export const getOAuthSignup = async () => {
  const { data } = await axiosInstance.get('/auth/oauth/signup');
  return data.data;
};
