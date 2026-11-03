// 회원가입 저장 로직(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(testSupport/dbTest.js).
import { dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { decryptField } from '../../../src/platform/fieldCrypto.js';
import { prisma } from '../../../src/platform/prismaClient.js';
import { findUserByCredentials, hashRefreshToken, registerUser, toPublicUser } from '../../../src/domains/auth/service.js';

process.env.FIELD_ENCRYPTION_KEY ??= 'c'.repeat(64);

const emails = [];
const newEmail = () => {
  const email = `register-${randomUUID()}@butler.test`;
  emails.push(email);
  return email;
};

const input = (overrides = {}) => ({
  email: newEmail(),
  password: 'abcd1234',
  name: '가입 테스트',
  phone: null,
  birthDate: '1990-01-31',
  role: 'LANDLORD',
  ...overrides,
});

// registerUser가 쓰는 req·res의 최소 모양
const fakeHttp = (cookies = {}) => {
  const set = {};
  return {
    req: { ip: '203.0.113.7', cookies, get: (name) => (name === 'user-agent' ? 'node-test' : undefined) },
    res: { cookie: (name, value) => (set[name] = value), set },
  };
};

describe('registerUser', { skip: dbTestSkip }, () => {
  after(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const userIds = users.map((user) => user.id);
    await prisma.consent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  test('가입하면 사용자·약관 동의 2건·세션이 함께 생기고 쿠키가 발급된다', async () => {
    const { req, res } = fakeHttp();
    const data = input();
    const user = await registerUser(req, res, data);

    assert.equal(user.role, 'LANDLORD');
    assert.equal(user.status, 'ACTIVE');
    assert.notEqual(user.passwordHash, data.password);
    assert.ok(user.passwordHash.startsWith('$2'));

    const consents = await prisma.consent.findMany({ where: { userId: user.id }, orderBy: { type: 'asc' } });
    assert.deepEqual(
      consents.map((consent) => [consent.type, consent.agreed, consent.ip]),
      [
        ['PRIVACY_REQUIRED', true, '203.0.113.7'],
        ['TERMS', true, '203.0.113.7'],
      ],
    );

    assert.ok(res.set.access_token && res.set.refresh_token);
    const session = await prisma.session.findUnique({ where: { refreshTokenHash: hashRefreshToken(res.set.refresh_token) } });
    assert.equal(session.userId, user.id);
    assert.equal(session.revokedAt, null);
  });

  test('가입한 이메일·비밀번호로 바로 로그인된다', async () => {
    const data = input({ email: newEmail() });
    await registerUser(...Object.values(fakeHttp()), data);
    assert.ok(await findUserByCredentials(data.email, data.password));
    assert.equal(await findUserByCredentials(data.email, 'wrong1234'), null);
  });

  test('휴대폰 번호는 암호문으로 저장되고 복호화하면 원래 값', async () => {
    const { req, res } = fakeHttp();
    const user = await registerUser(req, res, input({ phone: '01012345678' }));
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    assert.ok(row.phone.startsWith('enc:v1:'));
    assert.ok(!row.phone.includes('01012345678'));
    assert.equal(decryptField(row.phone), '01012345678');
  });

  test('생년월일은 암호문으로 저장되고 복호화하면 원래 값, 응답(toPublicUser)에는 나오지 않는다', async () => {
    const { req, res } = fakeHttp();
    const user = await registerUser(req, res, input({ birthDate: '1985-12-05' }));
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    assert.ok(row.birthDate.startsWith('enc:v1:'));
    assert.ok(!row.birthDate.includes('1985'));
    assert.equal(decryptField(row.birthDate), '1985-12-05');
    assert.equal('birthDate' in toPublicUser(row), false);
  });

  test('휴대폰 번호를 안 넣으면 null', async () => {
    const { req, res } = fakeHttp();
    const user = await registerUser(req, res, input());
    assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).phone, null);
  });

  test('이미 있는 이메일은 409 EMAIL_ALREADY_EXISTS — 대소문자가 달라도(소문자 정규화), 기존 계정은 그대로', async () => {
    const first = input();
    const created = await registerUser(...Object.values(fakeHttp()), first);

    await assert.rejects(registerUser(...Object.values(fakeHttp()), { ...first, password: 'other1234' }), {
      code: 'EMAIL_ALREADY_EXISTS',
      httpStatus: 409,
    });
    const after = await prisma.user.findUnique({ where: { id: created.id } });
    assert.equal(after.passwordHash, created.passwordHash);
    assert.equal(await prisma.user.count({ where: { email: first.email } }), 1);
  });

  test('탈퇴·정지 계정의 이메일로도 재가입할 수 없다(409)', async () => {
    const data = input();
    const created = await registerUser(...Object.values(fakeHttp()), data);
    await prisma.user.update({ where: { id: created.id }, data: { status: 'WITHDRAWN', withdrawnAt: new Date() } });
    await assert.rejects(registerUser(...Object.values(fakeHttp()), data), { code: 'EMAIL_ALREADY_EXISTS' });
  });

  test('같은 이메일로 동시에 가입하면 한 건만 성공하고 나머지는 409, 고아 동의·세션이 남지 않는다', async () => {
    const data = input();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => registerUser(...Object.values(fakeHttp()), { ...data })),
    );

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 4);
    for (const result of rejected) assert.equal(result.reason.code, 'EMAIL_ALREADY_EXISTS');

    const userId = fulfilled[0].value.id;
    assert.equal(await prisma.user.count({ where: { email: data.email } }), 1);
    assert.equal(await prisma.consent.count({ where: { userId } }), 2);
    assert.equal(await prisma.session.count({ where: { userId } }), 1);
  });

  test('저장 도중 실패하면(암호화 키 없음) 사용자도 만들어지지 않는다', async () => {
    const key = process.env.FIELD_ENCRYPTION_KEY;
    delete process.env.FIELD_ENCRYPTION_KEY;
    const data = input({ phone: '01012345678' });
    try {
      await assert.rejects(registerUser(...Object.values(fakeHttp()), data), { code: 'INTERNAL_ERROR' });
    } finally {
      process.env.FIELD_ENCRYPTION_KEY = key;
    }
    assert.equal(await prisma.user.count({ where: { email: data.email } }), 0);
  });

  test('다른 계정의 refresh 쿠키가 남아 있으면 그 세션은 폐기된다', async () => {
    const old = fakeHttp();
    const oldUser = await registerUser(old.req, old.res, input());

    const next = fakeHttp({ refresh_token: old.res.set.refresh_token });
    const newUser = await registerUser(next.req, next.res, input());

    assert.notEqual(oldUser.id, newUser.id);
    const oldSession = await prisma.session.findUnique({ where: { refreshTokenHash: hashRefreshToken(old.res.set.refresh_token) } });
    assert.ok(oldSession.revokedAt);
  });
});
