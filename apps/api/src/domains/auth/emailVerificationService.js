// 회원가입 이메일 인증. 인증번호 발송 → 번호 확인(가입 토큰 발급) → 가입 때 토큰 사용(registerUser).
// 인증번호·토큰 원문은 저장하지 않는다. 번호는 서버 비밀값을 섞은 HMAC으로, 토큰은 SHA-256으로 해시해 둔다.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../platform/AppError.js';
import { mailer } from '../../platform/mailer.js';
import { prisma } from '../../platform/prismaClient.js';

export const CODE_TTL_MS = 10 * 60 * 1000; // 인증번호 유효 시간
export const TOKEN_TTL_MS = 30 * 60 * 1000; // 번호 확인 뒤 가입을 마쳐야 하는 시간
export const RESEND_COOLDOWN_MS = 60 * 1000; // 같은 이메일로 다시 보낼 수 있는 간격
const MAX_SENDS_PER_HOUR = 5; // 같은 이메일로 1시간에 보낼 수 있는 횟수
const MAX_ATTEMPTS = 5; // 인증번호 한 건당 틀릴 수 있는 횟수

const codeKey = () => createHmac('sha256', process.env.ACCESS_TOKEN_SECRET).update('email-verification-code').digest();
const hashCode = (email, code) => createHmac('sha256', codeKey()).update(`${email}:${code}`).digest('hex');
export const hashVerificationToken = (token) => createHash('sha256').update(token).digest('hex');

const invalidCodeError = () =>
  new AppError('EMAIL_VERIFICATION_INVALID', 400, '인증번호가 올바르지 않거나 만료되었습니다.');

// 이메일은 호출한 쪽에서 normalize·형식 검증을 끝낸 값이다.
export const sendEmailVerification = async (email) => {
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new AppError('EMAIL_ALREADY_EXISTS', 409, '이미 가입된 이메일입니다.');
  }

  const now = Date.now();
  const recent = await prisma.emailVerification.findMany({
    where: { email, createdAt: { gt: new Date(now - 60 * 60 * 1000) } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const waitMs = recent[0] ? RESEND_COOLDOWN_MS - (now - recent[0].createdAt.getTime()) : 0;
  if (waitMs > 0) {
    throw new AppError('RATE_LIMITED', 429, `${Math.ceil(waitMs / 1000)}초 후에 다시 요청할 수 있습니다.`);
  }
  if (recent.length >= MAX_SENDS_PER_HOUR) {
    throw new AppError('RATE_LIMITED', 429, '인증번호 요청이 너무 많습니다. 1시간 후 다시 시도해주세요.');
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const row = await prisma.emailVerification.create({
    data: { email, codeHash: hashCode(email, code), expiresAt: new Date(now + CODE_TTL_MS) },
  });

  try {
    await mailer.send({
      to: email,
      subject: '[Butler] 이메일 인증번호',
      text: `Butler 회원가입 인증번호는 ${code} 입니다.\n${CODE_TTL_MS / 60000}분 안에 입력해주세요.\n본인이 요청하지 않았다면 이 메일을 무시해주세요.`,
    });
  } catch (error) {
    // 보내지 못한 번호가 재전송 간격·횟수를 소모하지 않게 지운다.
    await prisma.emailVerification.delete({ where: { id: row.id } }).catch(() => {});
    throw error;
  }

  return { expiresInSeconds: CODE_TTL_MS / 1000, resendAfterSeconds: RESEND_COOLDOWN_MS / 1000 };
};

// 번호가 맞으면 가입에 쓸 일회용 토큰을 돌려준다. 없는 요청·만료·불일치는 모두 같은 400으로 답한다.
export const confirmEmailVerification = async (email, code) => {
  const now = new Date();
  const row = await prisma.emailVerification.findFirst({
    where: { email, verifiedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) throw invalidCodeError();

  // 시도 횟수를 먼저 올린다(조건부 한 문장이라 동시에 여러 번 찔러도 MAX_ATTEMPTS를 넘길 수 없다).
  const counted = await prisma.emailVerification.updateMany({
    where: { id: row.id, verifiedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) {
    throw new AppError('EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED', 429, '인증번호를 여러 번 틀렸습니다. 인증번호를 다시 요청해주세요.');
  }

  const expected = Buffer.from(row.codeHash, 'hex');
  const actual = Buffer.from(hashCode(email, code), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw invalidCodeError();

  const token = randomBytes(32).toString('hex');
  const verified = await prisma.emailVerification.updateMany({
    where: { id: row.id, verifiedAt: null },
    data: { verifiedAt: now, tokenHash: hashVerificationToken(token), expiresAt: new Date(now.getTime() + TOKEN_TTL_MS) },
  });
  if (verified.count === 0) throw invalidCodeError();

  return { verificationToken: token, expiresInSeconds: TOKEN_TTL_MS / 1000 };
};

// 가입 트랜잭션 안에서 토큰을 한 번 쓴다. 이 이메일로 인증된 토큰이 아니거나 만료·사용된 토큰이면 422.
// tx로 불러서, 이어지는 사용자 생성이 실패하면 토큰 사용도 같이 되돌아간다. 사용 시각(=이메일 인증 시각)을 돌려준다.
export const consumeVerificationToken = async (tx, email, token) => {
  const now = new Date();
  const claimed = await tx.emailVerification.updateMany({
    where: { email, tokenHash: hashVerificationToken(token), verifiedAt: { not: null }, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  if (claimed.count === 0) {
    throw new AppError('EMAIL_NOT_VERIFIED', 422, '이메일 인증을 완료해주세요. 인증이 만료되었다면 인증번호를 다시 받아주세요.');
  }
  return now;
};
