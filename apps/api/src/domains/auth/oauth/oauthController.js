import { timingSafeEqual } from 'node:crypto';
import { AppError } from '../../../platform/AppError.js';
import { sendData } from '../../../platform/respond.js';
import { parseOAuthSignupBody } from '../registerValidation.js';
import { buildRegisteredAuthMe, cookieOptions, revokeSessionByToken, startSession } from '../service.js';
import {
  SIGNUP_TICKET_MAX_AGE_MS,
  STATE_TTL_MS,
  createState,
  registerOAuthUser,
  resolveOAuthUser,
  signSignupTicket,
  verifySignupTicket,
} from './oauthService.js';
import { buildAuthorizeUrl, fetchProfile, getProvider } from './providers.js';

// state·가입 티켓 쿠키는 소셜 로그인 경로에서만 보낸다.
const OAUTH_COOKIE_PATH = '/api/v1/auth/oauth';
const oauthCookieOptions = { ...cookieOptions, path: OAUTH_COOKIE_PATH };
const STATE_COOKIE = 'oauth_state';
const SIGNUP_COOKIE = 'oauth_signup';

export const frontendUrl = () => {
  const url = process.env.OAUTH_FRONTEND_URL;
  if (!url) throw new AppError('OAUTH_UNAVAILABLE', 503, '소셜 로그인이 아직 준비되지 않았습니다.');
  return url.replace(/\/$/, '');
};

const isSameState = (expected, actual) => {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
};

// GET /auth/oauth/:provider — 제공자 로그인 화면으로 보낸다.
// 브라우저가 직접 이동해 오는 주소라 JSON 오류를 내면 사용자가 그대로 본다. 키가 없는 경우(503) 등은 로그인 화면으로 돌려보낸다.
export const startOAuth = (req, res, next) => {
  try {
    const config = getProvider(req.params.provider);
    const base = frontendUrl();
    const state = createState();
    let url;
    try {
      url = buildAuthorizeUrl(config, state);
    } catch (error) {
      if (error instanceof AppError) {
        console.warn('[oauth] 시작 실패', config.key, error.code);
        return res.redirect(`${base}/login?oauth_error=${encodeURIComponent(error.code)}`);
      }
      throw error;
    }

    res.cookie(STATE_COOKIE, state, { ...oauthCookieOptions, maxAge: STATE_TTL_MS });
    return res.redirect(url);
  } catch (error) {
    return next(error);
  }
};

// GET /auth/oauth/:provider/callback — 제공자가 돌려보내는 곳. 결과는 항상 프론트로 리다이렉트한다.
//  기존 사용자 → 쿠키 발급 후 /, 신규 → 가입 티켓 쿠키 후 /register/oauth, 실패 → /login?oauth_error=코드
export const oauthCallback = async (req, res, next) => {
  let config;
  let base;
  try {
    config = getProvider(req.params.provider);
    base = frontendUrl();
  } catch (error) {
    next(error);
    return;
  }

  // 사용자는 코드만 보므로 원인 추적용으로 제공자와 코드만 서버에 남긴다(인가 코드·토큰·이메일은 남기지 않는다).
  const fail = (code) => {
    console.warn('[oauth] 콜백 실패', config.key, code);
    return res.redirect(`${base}/login?oauth_error=${encodeURIComponent(code)}`);
  };

  try {
    const { code, state, error: providerError } = req.query;
    const expectedState = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, oauthCookieOptions);

    if (!isSameState(expectedState, state)) return fail('OAUTH_STATE_INVALID');
    if (providerError || typeof code !== 'string' || code === '') return fail('OAUTH_DENIED');

    const profile = await fetchProfile(config, code);
    const { user } = await resolveOAuthUser(config.provider, profile);

    if (user) {
      // 이 브라우저에 다른 계정의 세션이 남아 있으면 폐기한다.
      const previousToken = req.cookies?.refresh_token;
      if (previousToken) await revokeSessionByToken(previousToken).catch(() => {});
      await startSession(req, res, user);
      return res.redirect(`${base}/`);
    }

    res.cookie(SIGNUP_COOKIE, signSignupTicket(config.provider, profile), {
      ...oauthCookieOptions,
      maxAge: SIGNUP_TICKET_MAX_AGE_MS,
    });
    return res.redirect(`${base}/register/oauth`);
  } catch (error) {
    if (error instanceof AppError) return fail(error.code);
    return next(error);
  }
};

const requireTicket = (req) => {
  const ticket = verifySignupTicket(req.cookies?.[SIGNUP_COOKIE]);
  if (!ticket) throw new AppError('OAUTH_SIGNUP_EXPIRED', 401, '소셜 로그인을 다시 시도해주세요.');
  return ticket;
};

// GET /auth/oauth/signup — 추가 정보 입력 화면이 미리 채울 값(이메일은 고정, 이름은 수정 가능).
export const getOAuthSignup = (req, res, next) => {
  try {
    const { provider, email, name } = requireTicket(req);
    sendData(res, { provider, email, name }, { status: 200 });
  } catch (error) {
    next(error);
  }
};

// POST /auth/oauth/signup — 추가 정보(휴대폰·생년월일·약관 동의)를 받아 가입을 마무리하고 로그인 상태로 만든다.
export const completeOAuthSignup = async (req, res, next) => {
  try {
    const ticket = requireTicket(req);
    const input = parseOAuthSignupBody(req.body, ticket.name);
    const user = await registerOAuthUser(req, res, ticket, input);
    res.clearCookie(SIGNUP_COOKIE, oauthCookieOptions);
    sendData(res, buildRegisteredAuthMe(user), { status: 201 });
  } catch (error) {
    next(error);
  }
};
