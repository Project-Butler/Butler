import { resolveApiUrl } from '../../axios/resolveApiUrl';

// 구글·카카오 로그인을 시작하는 주소. fetch가 아니라 브라우저가 직접 이동한다(제공자 화면으로 리다이렉트되므로).
// provider: 'google' | 'kakao'
// inviteToken: 임차인 초대 중이면 초대 토큰(?invite=). 서버는 본인 확인 세션이 그 초대 것일 때만 받아들인다.
export const getOAuthStartUrl = (provider, inviteToken) => {
  const url = resolveApiUrl(`/api/v1/auth/oauth/${provider}`);
  return inviteToken ? `${url}?invite=${encodeURIComponent(inviteToken)}` : url;
};
