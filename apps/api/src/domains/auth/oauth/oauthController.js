import { timingSafeEqual } from 'node:crypto';
import { AppError } from '../../../platform/AppError.js';
import { decryptWithPurpose, encryptWithPurpose } from '../../../platform/fieldCrypto.js';
import { prisma } from '../../../platform/prismaClient.js';
import { sendData } from '../../../platform/respond.js';
import { findInvitationByToken } from '../../tenantInvitations/service.js';
import { clearVerificationCookie, requireVerification, throwInvitationUnusable } from '../../tenantInvitations/verificationSession.js';
import { parseOAuthSignupBody } from '../registerValidation.js';
import { assertInvitationReady, buildRegisteredAuthMe, cookieOptions, revokeSessionByToken, startSession } from '../service.js';
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
// 임차인 초대로 시작한 소셜 로그인(api-contract.md 1장 bt_oi). 값은 초대 토큰 원문을 용도별 키로 암호화한 것이다.
const INVITE_COOKIE = 'bt_oi';
const INVITE_PURPOSE = 'oauth-invite';
const INVITE_COOKIE_MAX_AGE_MS = 30 * 60 * 1000;

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

// 초대 진행 중이면 결과를 초대 화면으로 돌려보낸다(api-contract.md 4장 소셜 가입·로그인).
const invitePath = (token) => `/invite/${encodeURIComponent(token)}`;
const failurePath = (inviteToken, code) =>
  `${inviteToken ? invitePath(inviteToken) : '/login'}?oauth_error=${encodeURIComponent(code)}`;

// bt_oi 쿠키의 초대 토큰. 없거나 복호화되지 않으면 null.
const readInviteToken = (req) => {
  const sealed = req.cookies?.[INVITE_COOKIE];
  return typeof sealed === 'string' && sealed !== '' ? decryptWithPurpose(INVITE_PURPOSE, sealed) : null;
};

// ?invite=<token>은 bt_iv가 그 초대의 유효한 확인 세션일 때만 받아들인다. 아니면 무시(null).
const acceptInviteParam = async (req) => {
  const token = req.query?.invite;
  if (typeof token !== 'string' || token === '') return null;
  try {
    await requireVerification(prisma, req, await findInvitationByToken(prisma, token));
    return token;
  } catch (error) {
    if (error instanceof AppError) return null;
    throw error;
  }
};

// GET /auth/oauth/:provider — 제공자 로그인 화면으로 보낸다.
// 브라우저가 직접 이동해 오는 주소라 JSON 오류를 내면 사용자가 그대로 본다. 키가 없는 경우(503) 등은 로그인(초대) 화면으로 돌려보낸다.
export const startOAuth = async (req, res, next) => {
  try {
    const config = getProvider(req.params.provider);
    const base = frontendUrl();
    const inviteToken = await acceptInviteParam(req);
    const state = createState();
    let url;
    try {
      url = buildAuthorizeUrl(config, state);
    } catch (error) {
      if (error instanceof AppError) {
        console.warn('[oauth] 시작 실패', config.key, error.code);
        return res.redirect(`${base}${failurePath(inviteToken, error.code)}`);
      }
      throw error;
    }

    res.cookie(STATE_COOKIE, state, { ...oauthCookieOptions, maxAge: STATE_TTL_MS });
    // 초대로 시작하면 bt_oi를 새로 두고, 아니면(invite 없음·확인 세션 없음) 남은 bt_oi를 지운다.
    if (inviteToken) {
      res.cookie(INVITE_COOKIE, encryptWithPurpose(INVITE_PURPOSE, inviteToken), {
        ...oauthCookieOptions,
        maxAge: INVITE_COOKIE_MAX_AGE_MS,
      });
    } else {
      res.clearCookie(INVITE_COOKIE, oauthCookieOptions);
    }
    return res.redirect(url);
  } catch (error) {
    return next(error);
  }
};

// GET /auth/oauth/:provider/callback — 제공자가 돌려보내는 곳. 결과는 항상 프론트로 리다이렉트한다.
//  기존 사용자 → 쿠키 발급 후 /, 신규 → 가입 티켓 쿠키 후 /register/oauth, 실패 → /login?oauth_error=코드
//  초대(bt_oi)로 시작했으면 각각 /invite/:token, /invite/:token/register/oauth, /invite/:token?oauth_error=코드
export const oauthCallback = async (req, res, next) => {
  let config;
  let base;
  let inviteToken;
  try {
    config = getProvider(req.params.provider);
    base = frontendUrl();
    inviteToken = readInviteToken(req);
  } catch (error) {
    next(error);
    return;
  }

  // 사용자는 코드만 보므로 원인 추적용으로 제공자와 코드만 서버에 남긴다(인가 코드·토큰·이메일·초대 토큰은 남기지 않는다).
  const fail = (code) => {
    console.warn('[oauth] 콜백 실패', config.key, code);
    return res.redirect(`${base}${failurePath(inviteToken, code)}`);
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
      if (inviteToken) {
        // 기존 계정은 초대 화면에서 수락(A-09)한다. 초대 쿠키는 여기서 할 일이 끝났다.
        res.clearCookie(INVITE_COOKIE, oauthCookieOptions);
        return res.redirect(`${base}${invitePath(inviteToken)}`);
      }
      return res.redirect(`${base}/`);
    }

    res.cookie(SIGNUP_COOKIE, signSignupTicket(config.provider, profile), {
      ...oauthCookieOptions,
      maxAge: SIGNUP_TICKET_MAX_AGE_MS,
    });
    return res.redirect(`${base}${inviteToken ? `${invitePath(inviteToken)}/register/oauth` : '/register/oauth'}`);
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
// bt_oi가 있으면 초대 가입이다: role은 서버가 TENANT로 정하고, 초대와 확인 세션(bt_iv)을 다시 본 뒤 가입+수락을 한 트랜잭션으로 한다.
// bt_oi가 있는데 열리지 않거나 쓸 수 없는 초대면 실패시킨다(임대인 계정이 잘못 만들어지지 않게).
export const completeOAuthSignup = async (req, res, next) => {
  try {
    const ticket = requireTicket(req);
    const hasInviteCookie = Boolean(req.cookies?.[INVITE_COOKIE]);
    const inviteToken = hasInviteCookie ? readInviteToken(req) : null;
    if (hasInviteCookie && !inviteToken) throwInvitationUnusable('INVITATION_INVALID');
    const input = parseOAuthSignupBody(req.body, ticket.name, { invited: Boolean(inviteToken) });
    const invitationId = inviteToken ? await assertInvitationReady(req, inviteToken) : null;
    const user = await registerOAuthUser(req, res, ticket, input, { invitationId });
    res.clearCookie(SIGNUP_COOKIE, oauthCookieOptions);
    if (invitationId) {
      res.clearCookie(INVITE_COOKIE, oauthCookieOptions);
      clearVerificationCookie(res);
      console.info(`[invite] accepted invitationId=${invitationId} via=oauth`);
    }
    sendData(res, buildRegisteredAuthMe(user), { status: 201 });
  } catch (error) {
    next(error);
  }
};
