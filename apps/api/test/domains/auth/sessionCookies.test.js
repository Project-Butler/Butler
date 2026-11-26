// 로그인 쿠키는 세션 쿠키여야 한다: maxAge·expires 가 없어 브라우저를 닫으면 사라진다(#247).
// 만료는 쿠키가 아니라 JWT exp 와 DB 세션(sessions.expires_at)이 지킨다.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import jwt from 'jsonwebtoken';

process.env.ACCESS_TOKEN_SECRET ??= 'a'.repeat(32);
process.env.REFRESH_TOKEN_SECRET ??= 'b'.repeat(32);
process.env.FIELD_ENCRYPTION_KEY ??= 'c'.repeat(64);

const { setCookies, signAccessToken, signRefreshToken, cookieOptions } = await import('../../../src/domains/auth/service.js');

const USER = { id: 'u-1', role: 'LANDLORD' };
const issue = () => {
  const cookies = {};
  const res = { cookie: (name, value, options) => { cookies[name] = { value, options }; } };
  setCookies(res, USER, 'refresh-token-value');
  return cookies;
};

describe('setCookies', () => {
  test('access_token·refresh_token 두 쿠키를 모두 내려준다', () => {
    const cookies = issue();
    assert.deepEqual(Object.keys(cookies).sort(), ['access_token', 'refresh_token']);
    assert.equal(cookies.refresh_token.value, 'refresh-token-value');
  });

  test('두 쿠키 모두 maxAge·expires 가 없는 세션 쿠키다', () => {
    for (const [name, { options }] of Object.entries(issue())) {
      assert.equal(options.maxAge, undefined, `${name} 에 maxAge 가 있다`);
      assert.equal(options.expires, undefined, `${name} 에 expires 가 있다`);
    }
  });

  test('httpOnly·sameSite=lax 는 그대로 유지된다', () => {
    for (const [name, { options }] of Object.entries(issue())) {
      assert.equal(options.httpOnly, true, `${name} httpOnly`);
      assert.equal(options.sameSite, 'lax', `${name} sameSite`);
    }
    assert.equal(cookieOptions.secure, process.env.NODE_ENV === 'production');
  });
});

describe('쿠키에 만료가 없어도 토큰 자체의 만료는 그대로다 (세션 쿠키가 만료를 늘리지 않는다)', () => {
  test('access 토큰은 15분, refresh 토큰은 14일', () => {
    const access = jwt.decode(signAccessToken(USER));
    const refresh = jwt.decode(signRefreshToken(USER));
    assert.equal(access.exp - access.iat, 15 * 60);
    assert.equal(refresh.exp - refresh.iat, 14 * 24 * 60 * 60);
  });
});
