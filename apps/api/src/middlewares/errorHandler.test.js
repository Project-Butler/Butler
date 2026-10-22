import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../platform/AppError.js';
import { createErrorHandler } from './errorHandler.js';

const run = async (error, { user, userExists = async () => true } = {}) => {
  const res = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await createErrorHandler({ userExists })(error, { requestId: 'r1', user }, res, () => {});
  return res;
};

const bodyParserError = (type, status) => Object.assign(new Error(type), { type, status, expose: true });
const userFkError = Object.assign(new Error('fk'), { code: 'P2003', meta: { field_name: 'landlord_buildings_user_id_fkey (index)' } });

test('AppError는 그대로 Envelope로', async () => {
  const res = await run(new AppError('PROPERTY_NOT_FOUND', 404, '없음'));
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body.error, { code: 'PROPERTY_NOT_FOUND', message: '없음', details: [], requestId: 'r1' });
});

test('깨진 JSON 본문 → 400 VALIDATION_ERROR (500 아님)', async () => {
  const res = await run(bodyParserError('entity.parse.failed', 400));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.equal(res.body.error.details[0].field, 'body');
});

test('너무 큰 본문 → 400 VALIDATION_ERROR', async () => {
  const res = await run(bodyParserError('entity.too.large', 413));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('지워진 사용자의 토큰으로 쓰기(user_id 외래키 위반) → 401 UNAUTHENTICATED', async () => {
  const res = await run(userFkError, { user: { id: 'gone' }, userExists: async () => false });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'UNAUTHENTICATED');
});

test('$queryRaw의 user_id 외래키 위반(P2010 23503)도 401', async () => {
  const rawFk = Object.assign(new Error('raw'), {
    code: 'P2010',
    meta: { code: '23503', message: 'insert or update on table "landlord_buildings" violates foreign key constraint "landlord_buildings_user_id_fkey"' },
  });
  const res = await run(rawFk, { user: { id: 'gone' }, userExists: async () => false });
  assert.equal(res.statusCode, 401);
});

test('사용자가 있으면 user_id 외래키 위반도 500 그대로(다른 원인)', async () => {
  const res = await run(userFkError, { user: { id: 'u1' }, userExists: async () => true });
  assert.equal(res.statusCode, 500);
});

test('user_id가 아닌 외래키 위반, 사용자 확인 실패는 500', async () => {
  const complexFk = { ...userFkError, meta: { field_name: 'landlord_buildings_complex_id_fkey (index)' } };
  assert.equal((await run(complexFk, { user: { id: 'gone' }, userExists: async () => false })).statusCode, 500);
  const broken = async () => {
    throw new Error('db down');
  };
  assert.equal((await run(userFkError, { user: { id: 'gone' }, userExists: broken })).statusCode, 500);
});

test('예상 못 한 에러는 500 INTERNAL_ERROR, 내부 메시지 숨김', async () => {
  const res = await run(new Error('secret detail'));
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error.code, 'INTERNAL_ERROR');
  assert.ok(!res.body.error.message.includes('secret'));
});
