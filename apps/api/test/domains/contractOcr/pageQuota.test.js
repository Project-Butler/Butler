// Created: 2026-11-19
// 하루 쪽 수 한도 판단만 본다(DB 카운터 읽기·쓰기는 하지 않는다).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAILY_PAGE_LIMIT, checkPagesLeft } from '../../../src/domains/contractOcr/pageQuota.js';

test('남은 쪽 안이면 통과', () => {
  assert.doesNotThrow(() => checkPagesLeft(0, 5));
  assert.doesNotThrow(() => checkPagesLeft(DAILY_PAGE_LIMIT - 5, 5));
  assert.doesNotThrow(() => checkPagesLeft(DAILY_PAGE_LIMIT - 1, 1));
});

test('다 썼으면 429', () => {
  assert.throws(() => checkPagesLeft(DAILY_PAGE_LIMIT, 1), (error) => error.code === 'RATE_LIMITED' && error.message.includes('하루 100쪽'));
  // 동시에 보내 한도를 넘긴 경우도 다 쓴 것으로 본다.
  assert.throws(() => checkPagesLeft(DAILY_PAGE_LIMIT + 3, 1), (error) => error.code === 'RATE_LIMITED');
});

test('남은 쪽보다 많으면 남은 쪽 수를 알려주고 429', () => {
  assert.throws(() => checkPagesLeft(DAILY_PAGE_LIMIT - 3, 5), (error) => error.code === 'RATE_LIMITED' && error.message.includes('3쪽 더'));
});
