// 회원가입 이메일 인증번호 발송·확인·토큰 사용(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(helpers/dbTest.js).
import { dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, test } from 'node:test';
import {
  confirmEmailVerification,
  consumeVerificationToken,
  sendEmailVerification,
} from '../../../src/domains/auth/emailVerificationService.js';
import { registerUser } from '../../../src/domains/auth/service.js';
import { mailer } from '../../../src/platform/mailer.js';
import { prisma } from '../../../src/platform/prismaClient.js';

process.env.FIELD_ENCRYPTION_KEY ??= 'c'.repeat(64);
process.env.ACCESS_TOKEN_SECRET ??= 'a'.repeat(64);
process.env.REFRESH_TOKEN_SECRET ??= 'b'.repeat(64);

const emails = [];
const newEmail = () => {
  const email = `verify-${randomUUID()}@butler.test`;
  emails.push(email);
  return email;
};

// 발송된 메일에서 6자리 번호를 꺼낸다.
let sent;
const originalSend = mailer.send;
const lastCode = () => /(\d{6})/.exec(sent.at(-1).text)[1];

const fakeHttp = () => ({
  req: { ip: '203.0.113.7', cookies: {}, get: () => 'node-test' },
  res: { cookie: () => {} },
});

// 재전송 간격을 건너뛰려고 이전 요청의 생성 시각을 과거로 돌린다.
const ageRequests = (email) =>
  prisma.emailVerification.updateMany({ where: { email }, data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) } });

describe('이메일 인증', { skip: dbTestSkip }, () => {
  beforeEach(() => {
    sent = [];
    mailer.send = async (message) => {
      sent.push(message);
    };
  });

  after(async () => {
    mailer.send = originalSend;
    const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const userIds = users.map((user) => user.id);
    await prisma.emailVerification.deleteMany({ where: { email: { in: emails } } });
    await prisma.consent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  test('발송하면 6자리 번호가 메일로 가고 DB에는 해시만 남는다', async () => {
    const email = newEmail();
    const result = await sendEmailVerification(email);

    assert.deepEqual(result, { expiresInSeconds: 180, resendAfterSeconds: 60 });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, email);
    const code = lastCode();
    const row = await prisma.emailVerification.findFirst({ where: { email } });
    assert.notEqual(row.codeHash, code);
    assert.equal(row.verifiedAt, null);
  });

  test('이미 가입된 이메일은 409이고 메일을 보내지 않는다', async () => {
    const email = newEmail();
    await prisma.user.create({ data: { email, passwordHash: 'x', name: '기존', role: 'LANDLORD' } });

    await assert.rejects(sendEmailVerification(email), { code: 'EMAIL_ALREADY_EXISTS', httpStatus: 409 });
    assert.equal(sent.length, 0);
  });

  test('1분 안에 다시 요청하면 429, 간격이 지나면 다시 보낼 수 있다', async () => {
    const email = newEmail();
    await sendEmailVerification(email);
    await assert.rejects(sendEmailVerification(email), { code: 'RATE_LIMITED', httpStatus: 429 });

    await ageRequests(email);
    await sendEmailVerification(email);
    assert.equal(sent.length, 2);
  });

  test('1시간에 5번까지만 보낼 수 있다', async () => {
    const email = newEmail();
    for (let i = 0; i < 5; i += 1) {
      await sendEmailVerification(email);
      await ageRequests(email);
    }
    await assert.rejects(sendEmailVerification(email), { code: 'RATE_LIMITED', httpStatus: 429 });
    assert.equal(sent.length, 5);
  });

  test('메일 발송이 실패하면 요청 기록을 지워 재전송 간격·횟수를 쓰지 않는다', async () => {
    const email = newEmail();
    mailer.send = async () => {
      throw Object.assign(new Error('smtp down'), { code: 'EMAIL_SEND_FAILED' });
    };
    await assert.rejects(sendEmailVerification(email), { code: 'EMAIL_SEND_FAILED' });
    assert.equal(await prisma.emailVerification.count({ where: { email } }), 0);
  });

  test('맞는 번호면 토큰이 나오고, 그 토큰으로 가입하면 emailVerifiedAt이 채워진다', async () => {
    const email = newEmail();
    await sendEmailVerification(email);
    const { verificationToken } = await confirmEmailVerification(email, lastCode());
    assert.match(verificationToken, /^[0-9a-f]{64}$/);

    const { req, res } = fakeHttp();
    const user = await registerUser(req, res, {
      email, password: 'abcd1234', name: '인증 가입', phone: null, birthDate: '1990-01-31', role: 'LANDLORD',
      emailVerificationToken: verificationToken,
    });
    assert.ok(user.emailVerifiedAt instanceof Date);
  });

  test('틀린 번호는 400, 5번 틀리면 맞는 번호도 429로 막히고 새로 받아야 한다', async () => {
    const email = newEmail();
    await sendEmailVerification(email);
    const correct = lastCode();
    const wrong = correct === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(confirmEmailVerification(email, wrong), { code: 'EMAIL_VERIFICATION_INVALID', httpStatus: 400 });
    }
    await assert.rejects(confirmEmailVerification(email, correct), { code: 'EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED', httpStatus: 429 });

    await ageRequests(email);
    await sendEmailVerification(email);
    assert.ok((await confirmEmailVerification(email, lastCode())).verificationToken);
  });

  test('만료되었거나 요청한 적 없는 이메일은 400이다', async () => {
    const email = newEmail();
    await assert.rejects(confirmEmailVerification(email, '123456'), { code: 'EMAIL_VERIFICATION_INVALID' });

    await sendEmailVerification(email);
    await prisma.emailVerification.updateMany({ where: { email }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(confirmEmailVerification(email, lastCode()), { code: 'EMAIL_VERIFICATION_INVALID' });
  });

  test('번호를 다시 받으면 이전 번호는 쓸 수 없다', async () => {
    const email = newEmail();
    await sendEmailVerification(email);
    const first = lastCode();
    await ageRequests(email);
    await sendEmailVerification(email);
    const second = lastCode();

    if (first !== second) {
      await assert.rejects(confirmEmailVerification(email, first), { code: 'EMAIL_VERIFICATION_INVALID' });
    }
    assert.ok((await confirmEmailVerification(email, second)).verificationToken);
  });

  test('토큰은 한 번만, 인증한 그 이메일로만 쓸 수 있다', async () => {
    const email = newEmail();
    await sendEmailVerification(email);
    const { verificationToken } = await confirmEmailVerification(email, lastCode());

    await assert.rejects(
      prisma.$transaction((tx) => consumeVerificationToken(tx, newEmail(), verificationToken)),
      { code: 'EMAIL_NOT_VERIFIED', httpStatus: 422 },
    );
    await prisma.$transaction((tx) => consumeVerificationToken(tx, email, verificationToken));
    await assert.rejects(
      prisma.$transaction((tx) => consumeVerificationToken(tx, email, verificationToken)),
      { code: 'EMAIL_NOT_VERIFIED' },
    );
  });

  test('가입 저장이 실패하면 토큰 사용도 되돌아가 다시 쓸 수 있다', async () => {
    const email = newEmail();
    await sendEmailVerification(email);
    const { verificationToken } = await confirmEmailVerification(email, lastCode());

    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await consumeVerificationToken(tx, email, verificationToken);
        throw new Error('가입 저장 실패');
      }),
      { message: '가입 저장 실패' },
    );
    await prisma.$transaction((tx) => consumeVerificationToken(tx, email, verificationToken));
  });

  test('토큰이 없거나 엉뚱하면 가입할 수 없다(422)', async () => {
    const { req, res } = fakeHttp();
    await assert.rejects(
      registerUser(req, res, {
        email: newEmail(), password: 'abcd1234', name: '무인증', phone: null, birthDate: '1990-01-31', role: 'LANDLORD',
        emailVerificationToken: 'not-a-real-token', // secret-guard:allow 테스트용 더미 값
      }),
      { code: 'EMAIL_NOT_VERIFIED', httpStatus: 422 },
    );
  });
});
