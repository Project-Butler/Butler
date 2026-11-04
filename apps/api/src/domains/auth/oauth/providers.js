// 소셜 로그인 제공자별 설정과 응답 해석. 구글·카카오 모두 Authorization Code Flow를 쓴다.
// 토큰 교환(client_secret 사용)은 서버에서만 한다. 프로필은 { providerUserId, email, emailVerified, name }으로 맞춘다.
import { AppError } from '../../../platform/AppError.js';

const REQUEST_TIMEOUT_MS = Number(process.env.EXTERNAL_API_TIMEOUT_MS) || 8000;

const PROVIDERS = {
  google: {
    provider: 'GOOGLE',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token', // secret-guard:allow 토큰 교환 URL
    profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    prompt: 'select_account', // 이미 로그인된 계정으로 바로 통과하지 않고 계정을 고르게 한다
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET', // secret-guard:allow 환경 변수 이름
    // https://developers.google.com/identity/openid-connect/openid-connect#obtainuserinfo
    toProfile: (data) => ({
      providerUserId: data.sub ? String(data.sub) : null,
      email: data.email ?? null,
      emailVerified: data.email_verified === true,
      name: data.name ?? null,
    }),
  },
  kakao: {
    provider: 'KAKAO',
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    tokenUrl: 'https://kauth.kakao.com/oauth/token', // secret-guard:allow 토큰 교환 URL
    profileUrl: 'https://kapi.kakao.com/v2/user/me',
    scope: 'account_email profile_nickname',
    prompt: 'select_account',
    clientIdEnv: 'KAKAO_CLIENT_ID',
    clientSecretEnv: 'KAKAO_CLIENT_SECRET', // secret-guard:allow 환경 변수 이름
    // https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api#req-user-info
    // 이메일은 유효(is_email_valid)하고 인증(is_email_verified)된 경우에만 검증된 것으로 본다.
    toProfile: (data) => {
      const account = data.kakao_account ?? {};
      return {
        providerUserId: data.id === undefined || data.id === null ? null : String(data.id),
        email: account.email ?? null,
        emailVerified: account.is_email_valid === true && account.is_email_verified === true,
        name: account.profile?.nickname ?? null,
      };
    },
  },
};

export const getProvider = (key) => {
  const config = Object.hasOwn(PROVIDERS, key) ? PROVIDERS[key] : null;
  if (!config) throw new AppError('NOT_FOUND', 404, '지원하지 않는 소셜 로그인입니다.');
  return { key, ...config };
};

const requireCredentials = (config) => {
  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  const baseUrl = process.env.OAUTH_REDIRECT_BASE_URL;
  if (!clientId || !clientSecret || !baseUrl) {
    throw new AppError('OAUTH_UNAVAILABLE', 503, '소셜 로그인이 아직 준비되지 않았습니다.');
  }
  // 운영의 쿠키는 secure라 https에서만 오간다. 제공자 콘솔에도 https 주소만 등록할 수 있어 http면 처음부터 막는다.
  if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://')) {
    console.error('[oauth] 운영에서는 OAUTH_REDIRECT_BASE_URL이 https여야 합니다');
    throw new AppError('OAUTH_UNAVAILABLE', 503, '소셜 로그인이 아직 준비되지 않았습니다.');
  }
  return { clientId, clientSecret, redirectUri: `${baseUrl.replace(/\/$/, '')}/api/v1/auth/oauth/${config.key}/callback` };
};

export const buildAuthorizeUrl = (config, state) => {
  const { clientId, redirectUri } = requireCredentials(config);
  const url = new URL(config.authorizeUrl);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scope,
    prompt: config.prompt,
    state,
  }).toString();
  return url.toString();
};

// step은 로그에 남길 "제공자:단계"(예: google:token). 사용자에게는 502 코드만 가므로 원인은 서버 로그로 본다.
const requestJson = async (url, options, step) => {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    console.error(`[oauth] ${step} 요청 실패`, error?.name ?? 'unknown');
    throw new AppError('OAUTH_PROVIDER_ERROR', 502, '소셜 로그인 서버와 통신하지 못했습니다.');
  }
  if (!response.ok) {
    // 제공자가 알려 주는 오류 코드(invalid_grant, KOE320 등)만 남긴다. 본문 전체에는 토큰·개인정보가 있을 수 있다.
    const body = await response.json().catch(() => null);
    const reason = [body?.error, body?.error_code].filter((value) => typeof value === 'string').join(' ');
    console.error(`[oauth] ${step} 거절`, response.status, reason);
    throw new AppError('OAUTH_PROVIDER_ERROR', 502, '소셜 로그인 서버가 요청을 거절했습니다.');
  }
  return response.json().catch(() => {
    throw new AppError('OAUTH_PROVIDER_ERROR', 502, '소셜 로그인 서버의 응답을 읽지 못했습니다.');
  });
};

// authorization code → access token → 프로필. 어느 단계든 실패하면 OAUTH_PROVIDER_ERROR(502).
export const fetchProfile = async (config, code) => {
  const { clientId, clientSecret, redirectUri } = requireCredentials(config);

  const token = await requestJson(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  }, `${config.key}:token`);
  if (typeof token.access_token !== 'string') {
    throw new AppError('OAUTH_PROVIDER_ERROR', 502, '소셜 로그인 토큰을 받지 못했습니다.');
  }

  const data = await requestJson(config.profileUrl, {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
  }, `${config.key}:profile`);
  const profile = config.toProfile(data);
  if (!profile.providerUserId) throw new AppError('OAUTH_PROVIDER_ERROR', 502, '소셜 계정 정보를 받지 못했습니다.');

  return { ...profile, email: profile.email ? profile.email.trim().toLowerCase() : null };
};
