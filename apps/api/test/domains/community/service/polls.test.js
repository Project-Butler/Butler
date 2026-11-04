// 투표 마감 판정(DB 없음): closedAt != null || closesAt <= now — cron 이 closedAt 을 채우기 전에도 마감으로 본다
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPollClosed } from '../../../../src/domains/community/service/polls.js';

const NOW = new Date('2026-10-26T12:00:00Z');

test('closedAt 이 비고 closesAt 이 아직이면 진행 중', () => {
  assert.equal(isPollClosed({ closedAt: null, closesAt: new Date('2026-10-26T12:00:01Z') }, NOW), false);
});

test('closesAt 이 지났으면 cron 이 closedAt 을 채우기 전에도 마감', () => {
  assert.equal(isPollClosed({ closedAt: null, closesAt: new Date('2026-10-26T11:59:59Z') }, NOW), true);
  assert.equal(isPollClosed({ closedAt: null, closesAt: NOW }, NOW), true);
});

test('closedAt 이 채워져 있으면 마감', () => {
  assert.equal(isPollClosed({ closedAt: new Date('2026-10-25T00:00:00Z'), closesAt: new Date('2026-10-27T00:00:00Z') }, NOW), true);
});
