import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppError } from './AppError.js';
import { MAX_PAGE, assertSingleValues, parsePagination } from './requestValidation.js';

const run = (query) => {
  const details = [];
  const result = parsePagination(query, details);
  return { result, details };
};

test('page·size 기본값', () => {
  assert.deepEqual(run({}), { result: { page: 1, size: 20 }, details: [] });
});

test('page 상한과 size 상한', () => {
  assert.equal(run({ page: String(MAX_PAGE) }).details.length, 0);
  assert.equal(run({ page: String(MAX_PAGE + 1) }).details[0].field, 'page');
  assert.equal(run({ page: '100000000' }).details[0].field, 'page');
  assert.equal(run({ size: '101' }).details[0].field, 'size');
});

test('안전한 정수가 아니면 거부', () => {
  assert.equal(run({ page: '9007199254740993' }).details[0].field, 'page');
  assert.equal(run({ page: '0' }).details[0].field, 'page');
  assert.equal(run({ size: '1.5' }).details[0].field, 'size');
  assert.equal(run({ page: ['1', '2'] }).details[0].field, 'page');
});

test('같은 키를 여러 번 보내면 400', () => {
  assert.throws(() => assertSingleValues({ a: ['1', '2'] }), AppError);
  assert.doesNotThrow(() => assertSingleValues({ a: '1' }));
});
