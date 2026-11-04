import { createHmac, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AppError } from '../../../platform/AppError.js';
import { encryptField } from '../../../platform/fieldCrypto.js';
import { prisma } from '../../../platform/prismaClient.js';
import { PRIVACY_VERSION, TERMS_VERSION, createSessionRecord, revokeSessionByToken, setCookies } from '../service.js';

const SIGNUP_TICKET_TTL_MS = 15 * 60 * 1000;
export const STATE_TTL_MS = 10 * 60 * 1000;

export const createState = () => randomBytes(32).toString('hex');

// 가입 마무리 전까지 소셜 프로필을 들고 있는 단기 서명 토큰. 서버에 저장하지 않고 httpOnly 쿠키에 담는다.
// access 토큰과 서로 쓰일 수 없도록 ACCESS_TOKEN_SECRET에서 용도별 키를 따로 만들어 서명한다.
const ticketKey = () => createHmac('sha256', process.env.ACCESS_TOKEN_SECRET).update('oauth-signup-ticket').digest();

export const SIGNUP_TICKET_MAX_AGE_MS = SIGNUP_TICKET_TTL_MS;

export const signSignupTicket = (provider, profile) =>
  jwt.sign(
    { purpose: 'oauth_signup', provider, providerUserId: profile.providerUserId, email: profile.email, name: profile.name },
    ticketKey(),
    { expiresIn: Math.floor(SIGNUP_TICKET_TTL_MS / 1000) },
  );

// 없거나 만료·변조된 토큰이면 null
export const verifySignupTicket = (token) => {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, ticketKey());
    return payload.purpose === 'oauth_signup' ? payload : null;
  } catch {
    return null;
  }
};

const assertUserUsable = (user) => {
  if (user.status === 'WITHDRAWN') {
    throw new AppError('AUTH_ACCOUNT_UNAVAILABLE', 403, '사용할 수 없는 계정입니다.');
  }
  if (user.status === 'SUSPENDED') {
    throw new AppError('AUTH_ACCOUNT_SUSPENDED', 403, '정지된 계정입니다. 운영팀에 문의해주세요.');
  }
};

const isUniqueViolation = (error, column) =>
  error?.code === 'P2002' && [].concat(error.meta?.target ?? []).some((target) => String(target).includes(column));

// 소셜 프로필로 누구인지 정한다.
//  1) 이미 연결된 소셜 계정이면 그 사용자로 로그인
//  2) 검증된 이메일이 기존 계정과 같으면 거절한다(임시 — #78에서 이메일을 인증한 계정에만 연결하도록 바꾼다)
//  3) 둘 다 아니면 가입이 필요하다 → { user: null }
// 카카오는 is_email_valid·is_email_verified가 모두 true일 때만 검증된 이메일로 본다.
// 이메일이 없거나 검증되지 않았으면 2)·3)을 하지 않고 거절한다(남의 이메일로 계정을 선점하는 것을 막는다).
export const resolveOAuthUser = async (provider, profile) => {
  const linked = await prisma.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider, providerUserId: profile.providerUserId } },
    include: { user: true },
  });
  if (linked) {
    assertUserUsable(linked.user);
    return { user: linked.user };
  }

  if (!profile.email) {
    throw new AppError('OAUTH_EMAIL_REQUIRED', 422, '이메일 제공에 동의해야 소셜 로그인을 사용할 수 있습니다.');
  }
  if (!profile.emailVerified) {
    throw new AppError('OAUTH_EMAIL_NOT_VERIFIED', 422, '인증된 이메일이 아니어서 소셜 로그인을 사용할 수 없습니다.');
  }

  const existing = await prisma.user.findUnique({ where: { email: profile.email }, select: { id: true, status: true } });
  if (!existing) return { user: null };

  assertUserUsable(existing);
  // 기존 계정의 이메일은 가입 때 소유 검증을 하지 않았다. 자동으로 연결하면 남의 이메일로 먼저 가입해 둔 사람이
  // 소셜 로그인한 본인 계정에 들어올 수 있으므로, 이메일 인증번호 가입(#78)이 생기기 전까지는 연결하지 않고 거절한다.
  throw new AppError('OAUTH_EMAIL_IN_USE', 409, '이미 가입된 이메일입니다. 이메일과 비밀번호로 로그인해주세요.');
};

// 소셜로 처음 오는 사람의 가입을 마무리한다. 사용자·소셜 연결·약관 동의·첫 세션을 한 트랜잭션으로 만들고 쿠키를 내려준다.
// ticket은 verifySignupTicket을 통과한 값, input은 parseOAuthSignupBody를 통과한 값이다.
export const registerOAuthUser = async (req, res, ticket, { name, phone, birthDate, role }) => {
  const encryptedPhone = phone ? encryptField(phone) : null;
  const encryptedBirthDate = encryptField(birthDate);
  const agreedAt = new Date();
  const ip = req.ip ?? null;

  let created;
  let refreshToken;
  try {
    ({ created, refreshToken } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: ticket.email, passwordHash: null, name, phone: encryptedPhone, birthDate: encryptedBirthDate, role },
      });
      await tx.oAuthAccount.create({
        data: { userId: user.id, provider: ticket.provider, providerUserId: ticket.providerUserId, email: ticket.email },
      });
      await tx.consent.createMany({
        data: [
          { userId: user.id, type: 'TERMS', version: TERMS_VERSION, agreed: true, agreedAt, ip },
          { userId: user.id, type: 'PRIVACY_REQUIRED', version: PRIVACY_VERSION, agreed: true, agreedAt, ip },
        ],
      });
      return { created: user, refreshToken: await createSessionRecord(tx, req, user) };
    }));
  } catch (error) {
    if (isUniqueViolation(error, 'email')) throw new AppError('EMAIL_ALREADY_EXISTS', 409, '이미 가입된 이메일입니다.');
    if (error?.code === 'P2002') throw new AppError('OAUTH_ACCOUNT_CONFLICT', 409, '이미 연결된 소셜 계정입니다.');
    throw error;
  }

  // 이 브라우저에 다른 계정의 세션이 남아 있으면 폐기한다(쿠키는 새 계정 것으로 덮어쓴다).
  const previousToken = req.cookies?.refresh_token;
  if (previousToken) await revokeSessionByToken(previousToken).catch(() => {});

  setCookies(res, created, refreshToken);
  return created;
};
