import { resolveApiUrl } from '../../axios/resolveApiUrl';

// 구글·카카오 로그인을 시작하는 주소. fetch가 아니라 브라우저가 직접 이동한다(제공자 화면으로 리다이렉트되므로).
// provider: 'google' | 'kakao'
export const getOAuthStartUrl = (provider) => resolveApiUrl(`/api/v1/auth/oauth/${provider}`);
