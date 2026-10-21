import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { authGuard } from './authGuard.js';

process.env.ACCESS_TOKEN_SECRET ??= 'test-access-secret';

const run = (cookies) => {
  let passed;
  const req = { cookies };
  authGuard(req, {}, (error) => {
    passed = error ?? null;
  });
  return { error: passed, req };
};

test('access_token이 없고 refresh_token만 있으면 AUTH_TOKEN_EXPIRED(프론트가 refresh로 이어 감)', () => {
  const { error } = run({ refresh_token: 'anything' });
  assert.equal(error.code, 'AUTH_TOKEN_EXPIRED');
  assert.equal(error.httpStatus, 401);
});

test('쿠키가 둘 다 없으면 UNAUTHENTICATED', () => {
  assert.equal(run({}).error.code, 'UNAUTHENTICATED');
  assert.equal(run(undefined).error.code, 'UNAUTHENTICATED');
});

test('유효한 access_token이면 req.user를 채우고 통과', () => {
  const token = jwt.sign({ userId: 'u1', role: 'LANDLORD' }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1m' });
  const { error, req } = run({ access_token: token });
  assert.equal(error, null);
  assert.deepEqual(req.user, { id: 'u1', role: 'LANDLORD' });
});

test('만료된 access_token이면 AUTH_TOKEN_EXPIRED', () => {
  const token = jwt.sign({ userId: 'u1', role: 'LANDLORD', exp: Math.floor(Date.now() / 1000) - 10 }, process.env.ACCESS_TOKEN_SECRET);
  assert.equal(run({ access_token: token }).error.code, 'AUTH_TOKEN_EXPIRED');
});
