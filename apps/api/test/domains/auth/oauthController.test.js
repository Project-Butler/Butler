// 소셜 로그인 시작·콜백의 리다이렉트(DB 없음). 제공자 호출 전에 끝나는 경로만 본다.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { oauthCallback, startOAuth } from '../../../src/domains/auth/oauth/oauthController.js';

const ENV = {
  GOOGLE_CLIENT_ID: 'g-id',
  GOOGLE_CLIENT_SECRET: 'g-secret',
  OAUTH_REDIRECT_BASE_URL: 'http://localhost:4000',
  OAUTH_FRONTEND_URL: 'http://localhost:5173/',
};

const fakeRes = () => {
  const res = { redirected: null, cookies: {}, cleared: [] };
  res.redirect = (url) => {
    res.redirected = url;
  };
  res.cookie = (name, value, options) => {
    res.cookies[name] = { value, options };
  };
  res.clearCookie = (name) => {
    res.cleared.push(name);
  };
  return res;
};

// 컨트롤러가 next(error)로 넘기는 경우를 기록한다.
const run = async (handler, req) => {
  const res = fakeRes();
  let nextError;
  await handler(req, res, (error) => {
    nextError = error;
  });
  return { res, nextError };
};

describe('소셜 로그인 컨트롤러', () => {
  const saved = {};

  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
  });
  afterEach(() => {
    for (const key of Object.keys(ENV)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test('시작: state 쿠키를 심고 제공자 로그인 화면으로 보낸다', async () => {
    const { res } = await run(startOAuth, { params: { provider: 'google' } });

    const url = new URL(res.redirected);
    assert.equal(url.origin, 'https://accounts.google.com');
    assert.equal(url.searchParams.get('state'), res.cookies.oauth_state.value);
    assert.equal(res.cookies.oauth_state.options.httpOnly, true);
    assert.equal(res.cookies.oauth_state.options.path, '/api/v1/auth/oauth');
  });

  test('시작: 키가 없으면 JSON 오류 대신 로그인 화면으로 코드를 달아 돌려보낸다', async () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    const { res, nextError } = await run(startOAuth, { params: { provider: 'google' } });

    assert.equal(nextError, undefined);
    assert.equal(res.redirected, 'http://localhost:5173/login?oauth_error=OAUTH_UNAVAILABLE');
    assert.equal(res.cookies.oauth_state, undefined);
  });

  test('시작: 모르는 제공자는 404로 넘긴다', async () => {
    const { nextError } = await run(startOAuth, { params: { provider: 'naver' } });
    assert.equal(nextError.httpStatus, 404);
  });

  test('콜백: state 쿠키가 없거나 다르면 OAUTH_STATE_INVALID로 돌려보내고 state 쿠키를 지운다', async () => {
    const missing = await run(oauthCallback, { params: { provider: 'google' }, query: { code: 'c', state: 's' }, cookies: {} });
    assert.equal(missing.res.redirected, 'http://localhost:5173/login?oauth_error=OAUTH_STATE_INVALID');
    assert.deepEqual(missing.res.cleared, ['oauth_state']);

    const different = await run(oauthCallback, {
      params: { provider: 'google' },
      query: { code: 'c', state: 'other' },
      cookies: { oauth_state: 'mine' },
    });
    assert.equal(different.res.redirected, 'http://localhost:5173/login?oauth_error=OAUTH_STATE_INVALID');
  });

  test('콜백: 사용자가 동의 화면에서 취소하면 OAUTH_DENIED로 돌려보낸다', async () => {
    const { res } = await run(oauthCallback, {
      params: { provider: 'google' },
      query: { error: 'access_denied', state: 'same' },
      cookies: { oauth_state: 'same' },
    });
    assert.equal(res.redirected, 'http://localhost:5173/login?oauth_error=OAUTH_DENIED');
  });

  test('콜백·시작이 실패하면 제공자와 코드만 서버 로그에 남긴다', async (t) => {
    const warned = t.mock.method(console, 'warn', () => {});
    await run(oauthCallback, { params: { provider: 'google' }, query: { code: 'secret-code', state: 's' }, cookies: {} });
    delete process.env.GOOGLE_CLIENT_SECRET;
    await run(startOAuth, { params: { provider: 'google' } });

    const lines = warned.mock.calls.map((call) => call.arguments.join(' '));
    assert.deepEqual(lines, ['[oauth] 콜백 실패 google OAUTH_STATE_INVALID', '[oauth] 시작 실패 google OAUTH_UNAVAILABLE']);
  });

  test('콜백: 프론트 주소 설정이 없으면 돌려보낼 곳이 없어 503으로 넘긴다', async () => {
    delete process.env.OAUTH_FRONTEND_URL;
    const { res, nextError } = await run(oauthCallback, { params: { provider: 'google' }, query: {}, cookies: {} });

    assert.equal(res.redirected, null);
    assert.equal(nextError.httpStatus, 503);
  });
});
