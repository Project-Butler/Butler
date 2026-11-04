// 소셜 로그인 사용자 결정·가입 저장(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(helpers/dbTest.js).
import { dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { registerOAuthUser, resolveOAuthUser } from '../../../src/domains/auth/oauth/oauthService.js';
import { decryptField } from '../../../src/platform/fieldCrypto.js';
import { prisma } from '../../../src/platform/prismaClient.js';
import { findUserByCredentials, hashPassword } from '../../../src/domains/auth/service.js';

process.env.FIELD_ENCRYPTION_KEY ??= 'c'.repeat(64);
process.env.ACCESS_TOKEN_SECRET ??= 'a'.repeat(64);
process.env.REFRESH_TOKEN_SECRET ??= 'b'.repeat(64);

const emails = [];
const newEmail = () => {
  const email = `oauth-${randomUUID()}@butler.test`;
  emails.push(email);
  return email;
};

const fakeHttp = (cookies = {}) => {
  const set = {};
  return {
    req: { ip: '203.0.113.7', cookies, get: (name) => (name === 'user-agent' ? 'node-test' : undefined) },
    res: { cookie: (name, value) => (set[name] = value), set },
  };
};

const profileOf = (email, overrides = {}) => ({
  providerUserId: randomUUID(),
  email,
  emailVerified: true,
  name: '소셜 테스트',
  ...overrides,
});
const ticketOf = (provider, profile) => ({ provider, providerUserId: profile.providerUserId, email: profile.email, name: profile.name });
// 비밀번호로 가입한 기존 계정. verified면 이메일 인증을 마친 계정이다.
const createPasswordUser = async (email, { verified }) =>
  prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword('abcd1234'),
      name: '기존',
      role: 'LANDLORD',
      emailVerifiedAt: verified ? new Date() : null,
    },
  });

const signupInput = { name: '소셜 테스트', phone: null, birthDate: '1990-01-31', role: 'LANDLORD' };

describe('소셜 로그인', { skip: dbTestSkip }, () => {
  after(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const userIds = users.map((user) => user.id);
    await prisma.oAuthAccount.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.consent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  test('처음 오는 사람은 가입이 필요하고, 가입하면 사용자·소셜 연결·약관 동의·세션이 생긴다', async () => {
    const profile = profileOf(newEmail());
    assert.deepEqual(await resolveOAuthUser('GOOGLE', profile), { user: null });

    const { req, res } = fakeHttp();
    const user = await registerOAuthUser(req, res, ticketOf('GOOGLE', profile), { ...signupInput, phone: '01012345678' });

    assert.equal(user.email, profile.email);
    assert.equal(user.passwordHash, null);
    assert.ok(user.emailVerifiedAt instanceof Date);
    assert.equal(decryptField(user.phone), '01012345678');
    assert.equal(decryptField(user.birthDate), '1990-01-31');
    assert.ok(res.set.access_token && res.set.refresh_token);
    assert.equal(await prisma.consent.count({ where: { userId: user.id } }), 2);
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 1);

    // 다음부터는 연결된 소셜 계정으로 바로 로그인된다.
    const again = await resolveOAuthUser('GOOGLE', profile);
    assert.equal(again.user.id, user.id);
  });

  test('비밀번호가 없는 계정은 어떤 비밀번호로도 일반 로그인이 안 된다', async () => {
    const profile = profileOf(newEmail());
    const { req, res } = fakeHttp();
    await registerOAuthUser(req, res, ticketOf('KAKAO', profile), signupInput);

    assert.equal(await findUserByCredentials(profile.email, 'butler-dummy-password'), null);
    assert.equal(await findUserByCredentials(profile.email, 'abcd1234'), null);
  });

  test('이메일 인증을 마친 기존 계정과 이메일이 같으면 그 계정에 연결된다', async () => {
    const email = newEmail();
    const existing = await createPasswordUser(email, { verified: true });

    const { user } = await resolveOAuthUser('KAKAO', profileOf(email));
    assert.equal(user.id, existing.id);
    assert.equal(await prisma.oAuthAccount.count({ where: { userId: existing.id, provider: 'KAKAO' } }), 1);
  });

  test('이메일 인증을 한 적 없는 기존 계정은 연결하지 않고 409로 거절한다', async () => {
    const email = newEmail();
    const existing = await createPasswordUser(email, { verified: false });

    await assert.rejects(resolveOAuthUser('KAKAO', profileOf(email)), { code: 'OAUTH_EMAIL_IN_USE', httpStatus: 409 });
    assert.equal(await prisma.oAuthAccount.count({ where: { userId: existing.id } }), 0);
  });

  test('이메일이 검증되지 않았거나 없으면 연결·가입 모두 거절한다', async () => {
    const email = newEmail();
    await createPasswordUser(email, { verified: true });

    await assert.rejects(resolveOAuthUser('KAKAO', profileOf(email, { emailVerified: false })), { code: 'OAUTH_EMAIL_NOT_VERIFIED' });
    await assert.rejects(resolveOAuthUser('KAKAO', profileOf(null, { emailVerified: false })), { code: 'OAUTH_EMAIL_REQUIRED' });
    assert.equal(await prisma.oAuthAccount.count({ where: { user: { email } } }), 0);
  });

  test('같은 제공자의 다른 소셜 계정이 이미 붙은 사용자에게는 덮어쓰지 않고 409다', async () => {
    const email = newEmail();
    const existing = await createPasswordUser(email, { verified: true });
    await resolveOAuthUser('GOOGLE', profileOf(email));

    await assert.rejects(resolveOAuthUser('GOOGLE', profileOf(email)), { code: 'OAUTH_ACCOUNT_CONFLICT', httpStatus: 409 });
    assert.equal(await prisma.oAuthAccount.count({ where: { userId: existing.id } }), 1);
  });

  test('정지된 계정은 로그인되지 않는다', async () => {
    const profile = profileOf(newEmail());
    const { req, res } = fakeHttp();
    const user = await registerOAuthUser(req, res, ticketOf('GOOGLE', profile), signupInput);
    await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });

    await assert.rejects(resolveOAuthUser('GOOGLE', profile), { code: 'AUTH_ACCOUNT_SUSPENDED' });
  });

  test('가입 마무리 전에 같은 이메일이 가입되면 409다', async () => {
    const profile = profileOf(newEmail());
    await createPasswordUser(profile.email, { verified: true });

    const b = fakeHttp();
    await assert.rejects(registerOAuthUser(b.req, b.res, ticketOf('GOOGLE', profile), signupInput), { code: 'EMAIL_ALREADY_EXISTS' });
  });
});
