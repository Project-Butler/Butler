import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AppError } from '../../platform/AppError.js';
import { decryptField, encryptField } from '../../platform/fieldCrypto.js';
import { OWNERSHIP_REGION_SELECT, pickVerifiedLegalDongCodes } from '../../platform/ownershipStatus.js';
import { prisma } from '../../platform/prismaClient.js';
import { consumeVerificationToken } from './emailVerificationService.js';
import { normalizeEmail } from './registerValidation.js';

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // 15분 (api-contract.md 1장)
const REFRESH_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14일
// 교체된 지 이 시간 안에 같은 refresh 토큰이 또 오면 탭 두 개가 동시에 갱신한 것으로 보고 그 요청만 거절한다.
// 이보다 늦게 오면 탈취된 토큰의 재사용으로 보고 그 사용자의 모든 세션을 폐기한다.
const REFRESH_REUSE_GRACE_MS = 10 * 1000;

// 없는 이메일에도 bcrypt.compare를 한 번 돌려, 응답 시간으로 가입 여부를 알아내지 못하게 한다.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('butler-dummy-password', 10);

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
};

export const hashPassword = (password) => bcrypt.hash(password, 10);

// 이메일·비밀번호가 맞으면 User를, 아니면 null을 돌려준다. 계정 상태(정지 등)는 호출한 쪽이 본다.
export const findUserByCredentials = async (email, password) => {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const isMatch = typeof password === 'string' && (await bcrypt.compare(password, passwordHash));

  // 소셜 로그인으로만 가입한 계정(passwordHash null)은 더미 해시와 비교한 결과를 믿지 않고 항상 실패시킨다.
  return user?.passwordHash && isMatch ? user : null;
};

export const findUserById = (id) => prisma.user.findUnique({ where: { id } });

export const toPublicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  phone: decryptField(user.phone),
  role: user.role,
  status: user.status,
  createdAt: user.createdAt.toISOString(),
});

// POST /auth/login, POST /auth/register, GET /auth/me가 공통으로 쓰는 응답 모양(AuthMe).
// 끝나지 않은 소유 관계(endedAt null)만 세고, 법정동은 권리자 인증이 유효한(VERIFIED) 소유 관계만 모은다.
export const buildAuthMe = async (user) => {
  const ownerships = await prisma.ownership.findMany({
    where: { userId: user.id, endedAt: null },
    select: OWNERSHIP_REGION_SELECT,
  });

  return {
    user: toPublicUser(user),
    verifiedLegalDongCodes: pickVerifiedLegalDongCodes(ownerships),
    activeOwnershipCount: ownerships.length,
  };
};

export const signAccessToken = (user) =>
  jwt.sign({ userId: user.id, role: user.role }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });

// jti가 없으면 같은 초에 두 번 로그인할 때 토큰이 똑같아져 sessions.refresh_token_hash(unique)가 겹친다.
export const signRefreshToken = (user) =>
  jwt.sign({ userId: user.id, role: user.role, jti: randomUUID() }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: '14d',
  });

export const verifyRefreshToken = (token) => jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);

// DB에는 refresh 토큰 원문 대신 해시만 둔다. 토큰이 이미 충분히 긴 무작위 값이라 빠른 SHA-256이면 된다.
export const hashRefreshToken = (token) => createHash('sha256').update(token).digest('hex');

// client: 다른 작업과 같은 트랜잭션에 넣을 때 tx를 넘긴다(관리자 계정 정지). 기본은 prisma.
export const revokeAllSessions = (userId, client = prisma) =>
  client.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

export const revokeSessionByToken = (token) =>
  prisma.session.updateMany({
    where: { refreshTokenHash: hashRefreshToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });

export const setCookies = (res, user, refreshToken) => {
  res.cookie('access_token', signAccessToken(user), { ...cookieOptions, maxAge: ACCESS_TOKEN_TTL_MS });
  res.cookie('refresh_token', refreshToken, { ...cookieOptions, maxAge: REFRESH_TOKEN_TTL_MS });
};

// 세션 행을 만들고 refresh 토큰 원문을 돌려준다. db는 prisma 또는 트랜잭션 tx(가입이 사용자와 같이 만든다).
export const createSessionRecord = async (db, req, user) => {
  const refreshToken = signRefreshToken(user);
  await db.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
      ip: req.ip ?? null,
    },
  });
  return refreshToken;
};

// 새 세션을 만들고 access/refresh 쿠키를 내려준다. 로그인과 refresh 교체가 같이 쓴다.
export const startSession = async (req, res, user) => {
  setCookies(res, user, await createSessionRecord(prisma, req, user));
};

// refresh 토큰을 한 번 쓰고 새 토큰으로 바꾼다. 쓸 수 없는 토큰이면 null.
// "아직 유효한 세션을 폐기 처리"가 한 문장(updateMany)이라 동시에 두 요청이 와도 한쪽만 성공한다.
export const rotateSession = async (req, res, user, token) => {
  const now = new Date();
  const tokenHash = hashRefreshToken(token);

  const claimed = await prisma.session.updateMany({
    where: { refreshTokenHash: tokenHash, userId: user.id, revokedAt: null, expiresAt: { gt: now } },
    data: { revokedAt: now, lastUsedAt: now },
  });

  if (claimed.count === 0) {
    const session = await prisma.session.findUnique({ where: { refreshTokenHash: tokenHash } });
    const isReuse = session?.revokedAt && now.getTime() - session.revokedAt.getTime() > REFRESH_REUSE_GRACE_MS;
    if (isReuse) await revokeAllSessions(session.userId);
    return null;
  }

  await startSession(req, res, user);
  return user;
};

export const clearAuthCookies = (res) => {
  res.clearCookie('access_token', cookieOptions);
  res.clearCookie('refresh_token', cookieOptions);
};

// ----- 회원가입 -----

// 약관 문구를 바꾸면 이 버전을 올린다. 동의 이력(consents.version)에 그대로 남는다.
export const TERMS_VERSION = '2026-10-30';
export const PRIVACY_VERSION = '2026-10-30';

// 가입 직후 AuthMe: 소유 관계가 아직 없으므로 buildAuthMe를 다시 조회하지 않고 빈 값으로 채운다.
export const buildRegisteredAuthMe = (user) => ({
  user: toPublicUser(user),
  verifiedLegalDongCodes: [],
  activeOwnershipCount: 0,
});

const isEmailUniqueViolation = (error) =>
  error?.code === 'P2002' && [].concat(error.meta?.target ?? []).some((target) => String(target).includes('email'));

const emailTakenError = () => new AppError('EMAIL_ALREADY_EXISTS', 409, '이미 가입된 이메일입니다.');

// 사용자·약관 동의·첫 세션을 한 트랜잭션으로 만들고, 성공하면 쿠키를 내려준다.
// 입력은 parseRegisterBody를 통과한 값이다. 이메일 중복은 사전 조회 + 유니크 제약(동시 가입) 둘 다 409로 처리한다.
export const registerUser = async (req, res, { email, password, name, phone, birthDate, role, emailVerificationToken }) => {
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw emailTakenError();

  // 비용이 큰 해시·암호화는 트랜잭션 밖에서 끝낸다.
  const passwordHash = await hashPassword(password);
  const encryptedPhone = phone ? encryptField(phone) : null;
  const encryptedBirthDate = encryptField(birthDate);
  const agreedAt = new Date();
  const ip = req.ip ?? null;

  let created;
  let refreshToken;
  try {
    ({ created, refreshToken } = await prisma.$transaction(async (tx) => {
      // 인증번호로 이 이메일을 확인한 토큰을 먼저 쓴다. 이어지는 생성이 실패하면 함께 되돌아간다.
      const emailVerifiedAt = await consumeVerificationToken(tx, email, emailVerificationToken);
      const user = await tx.user.create({
        data: { email, passwordHash, name, phone: encryptedPhone, birthDate: encryptedBirthDate, role, emailVerifiedAt },
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
    if (isEmailUniqueViolation(error)) throw emailTakenError();
    throw error;
  }

  // 이 브라우저에 다른 계정의 세션이 남아 있으면 폐기한다(쿠키는 아래에서 새 계정 것으로 덮어쓴다).
  const previousToken = req.cookies?.refresh_token;
  if (previousToken) await revokeSessionByToken(previousToken).catch(() => {});

  setCookies(res, created, refreshToken);
  return created;
};
