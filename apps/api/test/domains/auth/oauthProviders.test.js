// 소셜 로그인 제공자 해석·가입 티켓·추가 정보 검증(DB 없음). 외부 호출은 fetch를 가짜로 바꿔 막는다.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { parseOAuthSignupBody } from '../../../src/domains/auth/registerValidation.js';
import { signSignupTicket, verifySignupTicket } from '../../../src/domains/auth/oauth/oauthService.js';
import { buildAuthorizeUrl, fetchProfile, getProvider } from '../../../src/domains/auth/oauth/providers.js';

process.env.ACCESS_TOKEN_SECRET ??= 'a'.repeat(64);

const ENV = {
  GOOGLE_CLIENT_ID: 'g-id',
  GOOGLE_CLIENT_SECRET: 'g-secret',
  KAKAO_CLIENT_ID: 'k-id',
  KAKAO_CLIENT_SECRET: 'k-secret',
  OAUTH_REDIRECT_BASE_URL: 'http://localhost:3000',
};

const jsonResponse = (body, ok = true) => ({ ok, json: async () => body });

describe('소셜 로그인 제공자', () => {
  const originalFetch = globalThis.fetch;
  const saved = {};

  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(ENV)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test('지원하지 않는 제공자는 404다', () => {
    assert.throws(() => getProvider('naver'), { code: 'NOT_FOUND', httpStatus: 404 });
    assert.throws(() => getProvider('__proto__'), { code: 'NOT_FOUND' });
  });

  test('인가 URL에 redirect_uri·state·scope가 들어간다', () => {
    const url = new URL(buildAuthorizeUrl(getProvider('kakao'), 'state-1'));
    assert.equal(url.origin + url.pathname, 'https://kauth.kakao.com/oauth/authorize');
    assert.equal(url.searchParams.get('client_id'), 'k-id');
    assert.equal(url.searchParams.get('state'), 'state-1');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3000/api/v1/auth/oauth/kakao/callback');
    assert.match(url.searchParams.get('scope'), /account_email/);
  });

  test('키가 없으면 503 OAUTH_UNAVAILABLE이다', () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    assert.throws(() => buildAuthorizeUrl(getProvider('google'), 's'), { code: 'OAUTH_UNAVAILABLE', httpStatus: 503 });
  });

  test('구글: email_verified를 그대로 따르고 이메일은 소문자로 맞춘다', async () => {
    globalThis.fetch = async (url) =>
      url.includes('token')
        ? jsonResponse({ access_token: 't' })
        : jsonResponse({ sub: '123', email: 'A@Example.com', email_verified: true, name: '홍길동' });
    const profile = await fetchProfile(getProvider('google'), 'code');
    assert.deepEqual(profile, { providerUserId: '123', email: 'a@example.com', emailVerified: true, name: '홍길동' });
  });

  test('카카오: is_email_valid와 is_email_verified가 모두 true일 때만 검증된 이메일이다', async () => {
    const respondWith = (account) => async (url) =>
      url.includes('/oauth/token') ? jsonResponse({ access_token: 't' }) : jsonResponse({ id: 99, kakao_account: account });

    globalThis.fetch = respondWith({ email: 'k@example.com', is_email_valid: true, is_email_verified: true, profile: { nickname: '카카오' } });
    assert.deepEqual(await fetchProfile(getProvider('kakao'), 'c'), {
      providerUserId: '99',
      email: 'k@example.com',
      emailVerified: true,
      name: '카카오',
    });

    globalThis.fetch = respondWith({ email: 'k@example.com', is_email_valid: true, is_email_verified: false });
    assert.equal((await fetchProfile(getProvider('kakao'), 'c')).emailVerified, false);

    globalThis.fetch = respondWith({});
    const noEmail = await fetchProfile(getProvider('kakao'), 'c');
    assert.equal(noEmail.email, null);
    assert.equal(noEmail.emailVerified, false);
  });

  test('제공자가 거절하거나 통신에 실패하면 502 OAUTH_PROVIDER_ERROR다', async () => {
    globalThis.fetch = async () => jsonResponse({}, false);
    await assert.rejects(fetchProfile(getProvider('google'), 'c'), { code: 'OAUTH_PROVIDER_ERROR', httpStatus: 502 });

    globalThis.fetch = async () => {
      throw new Error('network');
    };
    await assert.rejects(fetchProfile(getProvider('google'), 'c'), { code: 'OAUTH_PROVIDER_ERROR' });
  });
});

describe('소셜 가입 티켓', () => {
  const profile = { providerUserId: '123', email: 'a@example.com', name: '홍길동' };

  test('서명한 티켓은 같은 내용으로 검증된다', () => {
    const ticket = verifySignupTicket(signSignupTicket('GOOGLE', profile));
    assert.equal(ticket.provider, 'GOOGLE');
    assert.equal(ticket.providerUserId, '123');
    assert.equal(ticket.email, 'a@example.com');
  });

  test('없거나 변조된 값은 null이다', () => {
    assert.equal(verifySignupTicket(undefined), null);
    assert.equal(verifySignupTicket('abc.def.ghi'), null);
    assert.equal(verifySignupTicket(`${signSignupTicket('GOOGLE', profile)}x`), null);
  });
});

describe('parseOAuthSignupBody', () => {
  const valid = { phone: '010-1234-5678', birthDate: '1990-01-31', termsAgreed: true, privacyAgreed: true };

  test('이름을 생략하면 제공자가 준 이름을 쓰고 role은 LANDLORD다', () => {
    assert.deepEqual(parseOAuthSignupBody(valid, '홍길동'), {
      name: '홍길동',
      phone: '01012345678',
      birthDate: '1990-01-31',
      role: 'LANDLORD',
    });
  });

  test('보낸 이름이 제공자 이름보다 우선한다', () => {
    assert.equal(parseOAuthSignupBody({ ...valid, name: '김철수' }, '홍길동').name, '김철수');
  });

  test('생년월일·약관 동의가 없으면 400이다', () => {
    assert.throws(() => parseOAuthSignupBody({ ...valid, birthDate: undefined, termsAgreed: false }, '홍길동'), {
      code: 'VALIDATION_ERROR',
    });
  });

  test('이메일·역할 같은 허용되지 않은 필드는 거절한다', () => {
    assert.throws(() => parseOAuthSignupBody({ ...valid, email: 'x@example.com' }, '홍길동'), { code: 'VALIDATION_ERROR' });
    assert.throws(() => parseOAuthSignupBody({ ...valid, role: 'ADMIN' }, '홍길동'), { code: 'VALIDATION_ERROR' });
  });
});
