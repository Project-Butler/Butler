// 임차인 초대 가입(이메일·소셜)과 수락을 한 트랜잭션으로(docs/11 개발 계획 2-3, api-contract.md 4장). 실제 로컬 Postgres.
// RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js). 실제 app을 띄워 HTTP로 부르고, 소셜 제공자 응답만 테스트 전용 가짜로 바꾼다.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import app from '../../../src/app.js';
import { hashVerificationToken } from '../../../src/domains/auth/emailVerificationService.js';
import { signAccessToken } from '../../../src/domains/auth/service.js';
import { getTodayKST } from '../../../src/platform/dateUtils.js';
import { prisma } from '../../../src/platform/prismaClient.js';

const TODAY = getTodayKST();
const shift = (days) => {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};
const FRONT = 'http://front.example.test';
const ENV = {
  TENANT_APP_URL: FRONT,
  OAUTH_FRONTEND_URL: FRONT,
  GOOGLE_CLIENT_ID: 'g-id',
  GOOGLE_CLIENT_SECRET: 'g-secret', // secret-guard:allow 테스트용 더미 값
  OAUTH_REDIRECT_BASE_URL: 'http://localhost:4000',
};
const clearLimits = () =>
  prisma.rateLimit.deleteMany({
    where: { OR: [{ id: { startsWith: 'invite-' } }, { id: { startsWith: 'register:' } }, { id: { startsWith: 'oauth:' } }] },
  });

// set-cookie 목록에서 이름별 값을 꺼낸다. 지우는 쿠키(빈 값)는 ''.
const cookieMap = (setCookies) =>
  Object.fromEntries(setCookies.map((line) => {
    const [pair] = line.split(';');
    const index = pair.indexOf('=');
    return [pair.slice(0, index), pair.slice(index + 1)];
  }));
const cookieLine = (setCookies, name) => setCookies.find((line) => line.startsWith(`${name}=`));

describe('임차인 초대 가입', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const emails = [];
  const contractIds = [];
  const saved = {};
  const originalFetch = globalThis.fetch;
  let nextProfile = null;
  let server;
  let origin;

  before(async () => {
    for (const [key, value] of Object.entries(ENV)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
    // 제공자(구글) 호출만 가짜로 응답한다. 테스트가 app을 부르는 요청은 그대로 보낸다.
    globalThis.fetch = async (url, options) => {
      const href = String(url);
      if (href.startsWith('https://oauth2.googleapis.com/')) return { ok: true, json: async () => ({ access_token: 'fake' }) };
      if (href.startsWith('https://openidconnect.googleapis.com/')) return { ok: true, json: async () => nextProfile };
      return originalFetch(url, options);
    };
    server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach(() => clearLimits());

  after(async () => {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(ENV)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await new Promise((resolve) => server.close(resolve));
    const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const userIds = users.map((user) => user.id);
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { resourceId: { in: contractIds } }] } });
    await prisma.tenantInvitation.deleteMany({ where: { contractId: { in: contractIds } } });
    await prisma.contract.updateMany({ where: { id: { in: contractIds } }, data: { tenantId: null } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.oAuthAccount.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.consent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.emailVerification.deleteMany({ where: { email: { in: emails } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await clearLimits();
    await fixture.cleanup();
  });

  const newEmail = () => {
    const email = `invite-signup-${randomUUID()}@butler.test`;
    emails.push(email);
    return email;
  };

  let unitSeq = 0;
  // 인증된 소유 관계 + 진행 중 계약
  const setup = async () => {
    const landlord = await fixture.createUser('LANDLORD');
    const complex = await fixture.createComplex();
    unitSeq += 1;
    const property = await prisma.property.create({ data: { complexId: complex.id, buildingNo: '107', unitNo: `${3000 + unitSeq}` } });
    const ownership = await prisma.ownership.create({
      data: {
        propertyId: property.id,
        userId: landlord.id,
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        verificationExpiresAt: new Date(Date.now() + 86400000 * 365),
      },
    });
    const contract = await prisma.contract.create({
      data: {
        ownershipId: ownership.id,
        leaseType: 'MONTHLY',
        deposit: 50000000n,
        monthlyRent: 800000n,
        startDate: shift(-30),
        endDate: shift(700),
        tenantName: '이임차',
        tenantPhone: '01098765432',
      },
    });
    contractIds.push(contract.id);
    return { landlord, contract };
  };

  const api = async (pathname, { user = null, method = 'GET', body, cookies = [] } = {}) => {
    const cookieHeader = [...(user ? [`access_token=${signAccessToken(user)}`] : []), ...cookies].join('; ');
    const response = await fetch(`${origin}/api/v1${pathname}`, {
      method,
      redirect: 'manual',
      headers: {
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        'X-Requested-With': 'butler-web',
        'Content-Type': 'application/json',
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
    });
    const setCookies = response.headers.getSetCookie();
    const text = await response.text();
    return {
      status: response.status,
      body: text && response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : null,
      location: response.headers.get('location'),
      setCookies,
      cookies: cookieMap(setCookies),
    };
  };

  // 발급 + 본인 확인까지. token·bt_iv 값·초대 id를 돌려준다.
  const issueAndVerify = async () => {
    const context = await setup();
    const issued = await api(`/contracts/${context.contract.id}/tenant-invitations`, { user: context.landlord, method: 'POST', body: {} });
    assert.equal(issued.status, 201);
    const token = issued.body.data.inviteUrl.split('/invite/')[1];
    const verified = await api(`/tenant-invitations/${token}/verify`, { method: 'POST', body: { phoneLast4: '5432' } });
    assert.equal(verified.status, 200);
    return { ...context, token, iv: verified.cookies.bt_iv, invitationId: issued.body.data.id };
  };

  const issueVerifiedEmailToken = async (email) => {
    const token = randomUUID();
    await prisma.emailVerification.create({
      data: {
        email,
        codeHash: 'unused',
        verifiedAt: new Date(),
        tokenHash: hashVerificationToken(token),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    return token;
  };

  const registerBody = async (email, extra = {}) => ({
    email,
    password: 'abcd1234',
    name: '초대 임차인',
    birthDate: '1990-01-31',
    role: 'LANDLORD', // 화면은 그대로 LANDLORD를 보낸다. 초대 가입이면 서버가 무시한다.
    termsAgreed: true,
    privacyAgreed: true,
    emailVerificationToken: await issueVerifiedEmailToken(email),
    ...extra,
  });

  const expectAccepted = async ({ contract, invitationId }, userId) => {
    assert.equal((await prisma.contract.findUnique({ where: { id: contract.id } })).tenantId, userId);
    const invitation = await prisma.tenantInvitation.findUnique({ where: { id: invitationId } });
    assert.equal(invitation.status, 'ACCEPTED');
    assert.equal(invitation.acceptedById, userId);
    assert.equal(await prisma.tenantInvitationVerification.count({ where: { invitationId, revokedAt: null } }), 0);
  };

  test('이메일 가입 + 초대: 확인 세션이 있으면 TENANT로 가입하고 같은 트랜잭션에서 수락, bt_iv를 지운다', async () => {
    const context = await issueAndVerify();
    const email = newEmail();
    const registered = await api('/auth/register', {
      method: 'POST',
      body: await registerBody(email, { invitationToken: context.token }),
      cookies: [`bt_iv=${context.iv}`],
    });
    assert.equal(registered.status, 201);
    assert.equal(registered.body.data.user.role, 'TENANT');
    assert.ok(registered.cookies.access_token);
    assert.equal(registered.cookies.bt_iv, '');
    const user = await prisma.user.findUnique({ where: { email } });
    assert.equal(user.role, 'TENANT');
    await expectAccepted(context, user.id);
    assert.ok(await prisma.notification.findFirst({ where: { userId: context.landlord.id, type: 'TENANT_INVITATION_ACCEPTED' } }));
  });

  test('이메일 가입 + 초대: 확인 세션이 없거나 다른 초대 것이면 403이고 사용자는 생기지 않는다', async () => {
    const context = await issueAndVerify();
    const other = await issueAndVerify();
    for (const cookies of [[], [`bt_iv=${other.iv}`], ['bt_iv=garbage']]) {
      const email = newEmail();
      const response = await api('/auth/register', {
        method: 'POST',
        body: await registerBody(email, { invitationToken: context.token }),
        cookies,
      });
      assert.equal(response.status, 403, cookies.join());
      assert.equal(response.body.error.code, 'INVITATION_VERIFY_REQUIRED');
      assert.equal(await prisma.user.count({ where: { email } }), 0);
    }
    // 없는 토큰은 통일된 초대 에러
    const email = newEmail();
    const missing = await api('/auth/register', {
      method: 'POST',
      body: await registerBody(email, { invitationToken: 'x'.repeat(32) }),
      cookies: [`bt_iv=${context.iv}`],
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'INVITATION_INVALID');
    assert.equal(await prisma.user.count({ where: { email } }), 0);
  });

  test('이메일 가입 + 초대: 트랜잭션 안에서 수락이 실패하면 가입도 롤백되고 이메일 인증 토큰은 그대로 남는다', async () => {
    const context = await issueAndVerify();
    // 사전 확인(쓸 수 있는 초대·확인 세션)은 통과하고 잠근 뒤 수락에서만 실패하는 경우: 다른 임차인이 이미 연결됨
    const someone = await fixture.createUser('TENANT');
    await prisma.contract.update({ where: { id: context.contract.id }, data: { tenantId: someone.id } });
    const email = newEmail();
    const response = await api('/auth/register', {
      method: 'POST',
      body: await registerBody(email, { invitationToken: context.token }),
      cookies: [`bt_iv=${context.iv}`],
    });
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'CONTRACT_TENANT_ALREADY_LINKED');
    assert.equal(await prisma.user.count({ where: { email } }), 0);
    assert.equal((await prisma.emailVerification.findFirst({ where: { email } })).consumedAt, null);
    assert.equal((await prisma.tenantInvitation.findUnique({ where: { id: context.invitationId } })).status, 'PENDING');
    await prisma.contract.update({ where: { id: context.contract.id }, data: { tenantId: null } });
  });

  test('이메일 가입: 초대 없이 TENANT면 422, 초대 없는 LANDLORD 가입은 그대로', async () => {
    const tenantEmail = newEmail();
    const rejected = await api('/auth/register', { method: 'POST', body: await registerBody(tenantEmail, { role: 'TENANT' }) });
    assert.equal(rejected.status, 422);
    assert.equal(rejected.body.error.code, 'TENANT_INVITATION_UNAVAILABLE');
    const landlordEmail = newEmail();
    const ok = await api('/auth/register', { method: 'POST', body: await registerBody(landlordEmail) });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.data.user.role, 'LANDLORD');
  });

  // 시작 → 콜백. 콜백 응답과 bt_oi 값을 돌려준다.
  const startAndCallback = async ({ token, iv }, profile) => {
    const started = await api(`/auth/oauth/google?invite=${token}`, { cookies: [`bt_iv=${iv}`] });
    assert.equal(started.status, 302);
    const sealed = started.cookies.bt_oi;
    assert.ok(sealed);
    nextProfile = profile;
    const callback = await api(`/auth/oauth/google/callback?code=c&state=${started.cookies.oauth_state}`, {
      cookies: [`oauth_state=${started.cookies.oauth_state}`, `bt_oi=${sealed}`],
    });
    return { callback, sealed };
  };
  const googleProfile = (email) => ({ sub: randomUUID(), email, email_verified: true, name: '소셜 임차인' });
  const signupBody = { birthDate: '1990-01-31', termsAgreed: true, privacyAgreed: true };

  test('OAuth 시작: 확인 세션이 그 초대 것일 때만 bt_oi(암호화·HttpOnly·Lax·oauth 경로·30분)를 둔다', async () => {
    const context = await issueAndVerify();
    const other = await issueAndVerify();
    const started = await api(`/auth/oauth/google?invite=${context.token}`, { cookies: [`bt_iv=${context.iv}`] });
    assert.equal(started.status, 302);
    assert.ok(started.location.startsWith('https://accounts.google.com/'));
    const line = cookieLine(started.setCookies, 'bt_oi');
    assert.ok(started.cookies.bt_oi);
    assert.ok(!line.includes(context.token));
    for (const part of [/HttpOnly/, /SameSite=Lax/, /Path=\/api\/v1\/auth\/oauth/, /Max-Age=1800/]) assert.match(line, part);

    for (const cookies of [[], [`bt_iv=${other.iv}`]]) {
      const ignored = await api(`/auth/oauth/google?invite=${context.token}`, { cookies });
      assert.equal(ignored.status, 302);
      assert.ok(!ignored.cookies.bt_oi, cookies.join()); // 두지 않는다(남은 것은 지운다)
    }
    const plain = await api('/auth/oauth/google', { cookies: [`bt_oi=${started.cookies.bt_oi}`] });
    assert.equal(plain.cookies.bt_oi, ''); // invite 없이 시작하면 남은 bt_oi를 지운다
  });

  test('OAuth 콜백: bt_oi가 있으면 새 사용자는 /invite/:token/register/oauth, 실패는 /invite/:token?oauth_error', async () => {
    const context = await issueAndVerify();
    const { callback, sealed } = await startAndCallback(context, googleProfile(newEmail()));
    assert.equal(callback.status, 302);
    assert.equal(callback.location, `${FRONT}/invite/${context.token}/register/oauth`);
    assert.ok(callback.cookies.oauth_signup);

    const failed = await api('/auth/oauth/google/callback?code=c&state=x', { cookies: ['oauth_state=y', `bt_oi=${sealed}`] });
    assert.equal(failed.location, `${FRONT}/invite/${context.token}?oauth_error=OAUTH_STATE_INVALID`);
    // 변조된 bt_oi는 없는 것과 같다
    const tampered = await api('/auth/oauth/google/callback?code=c&state=x', { cookies: ['oauth_state=y', `bt_oi=${sealed}x`] });
    assert.equal(tampered.location, `${FRONT}/login?oauth_error=OAUTH_STATE_INVALID`);
  });

  test('OAuth 콜백: 이미 연결된 계정이면 로그인 후 /invite/:token으로 돌아가고 bt_oi를 지운다', async () => {
    const context = await issueAndVerify();
    const email = newEmail();
    const profile = googleProfile(email);
    const existing = await prisma.user.create({ data: { email, passwordHash: null, name: '기존 임차인', role: 'TENANT' } });
    await prisma.oAuthAccount.create({ data: { userId: existing.id, provider: 'GOOGLE', providerUserId: profile.sub, email } });
    const { callback } = await startAndCallback(context, profile);
    assert.equal(callback.location, `${FRONT}/invite/${context.token}`);
    assert.ok(callback.cookies.access_token);
    assert.equal(callback.cookies.bt_oi, '');
  });

  test('OAuth 가입 완료: bt_oi + bt_iv면 TENANT로 가입+수락하고 bt_oi·bt_iv를 지운다', async () => {
    const context = await issueAndVerify();
    const email = newEmail();
    const { callback, sealed } = await startAndCallback(context, googleProfile(email));
    const signup = await api('/auth/oauth/signup', {
      method: 'POST',
      body: signupBody,
      cookies: [`oauth_signup=${callback.cookies.oauth_signup}`, `bt_oi=${sealed}`, `bt_iv=${context.iv}`],
    });
    assert.equal(signup.status, 201);
    assert.equal(signup.body.data.user.role, 'TENANT');
    assert.equal(signup.cookies.bt_oi, '');
    assert.equal(signup.cookies.bt_iv, '');
    const user = await prisma.user.findUnique({ where: { email } });
    assert.equal(user.role, 'TENANT');
    assert.equal(await prisma.oAuthAccount.count({ where: { userId: user.id, provider: 'GOOGLE' } }), 1);
    await expectAccepted(context, user.id);
  });

  test('OAuth 가입 완료: bt_iv 없이 bt_oi만 있거나 bt_oi가 깨졌으면 거절하고 사용자를 만들지 않는다', async () => {
    const context = await issueAndVerify();
    const email = newEmail();
    const { callback, sealed } = await startAndCallback(context, googleProfile(email));
    const ticket = `oauth_signup=${callback.cookies.oauth_signup}`;

    const noIv = await api('/auth/oauth/signup', { method: 'POST', body: signupBody, cookies: [ticket, `bt_oi=${sealed}`] });
    assert.equal(noIv.status, 403);
    assert.equal(noIv.body.error.code, 'INVITATION_VERIFY_REQUIRED');

    const broken = await api('/auth/oauth/signup', {
      method: 'POST',
      body: signupBody,
      cookies: [ticket, 'bt_oi=broken', `bt_iv=${context.iv}`],
    });
    assert.equal(broken.status, 404);
    assert.equal(broken.body.error.code, 'INVITATION_INVALID');
    assert.equal(await prisma.user.count({ where: { email } }), 0);

    // 수락에서 실패(다른 임차인이 이미 연결)하면 소셜 가입도 롤백된다
    const someone = await fixture.createUser('TENANT');
    await prisma.contract.update({ where: { id: context.contract.id }, data: { tenantId: someone.id } });
    const linked = await api('/auth/oauth/signup', {
      method: 'POST',
      body: signupBody,
      cookies: [ticket, `bt_oi=${sealed}`, `bt_iv=${context.iv}`],
    });
    assert.equal(linked.status, 409);
    assert.equal(await prisma.user.count({ where: { email } }), 0);
    assert.equal(await prisma.oAuthAccount.count({ where: { email } }), 0);
    await prisma.contract.update({ where: { id: context.contract.id }, data: { tenantId: null } });
  });
});
