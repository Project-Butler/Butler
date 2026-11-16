import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { REFRESH_MIN_AGE_MS } from '../../../../src/domains/marketPrices/marketPriceRules.js';
import { retentionMonths } from '../../../../src/domains/marketPrices/months.js';
import { planCollectionTasks } from '../../../../src/domains/marketPrices/service/collect.js';

const NOW = Date.parse('2026-11-17T03:00:00Z'); // 한국 시간 11/17 12:00
const months = retentionMonths(new Date(NOW));
const HOUR = 60 * 60 * 1000;
const done = (sigunguCode, yearMonth, dealKind, { collectedAgo = HOUR, attemptedAgo = collectedAgo } = {}) => ({
  sigunguCode,
  yearMonth,
  dealKind,
  collectedAt: new Date(NOW - collectedAgo),
  attemptedAt: new Date(NOW - attemptedAgo),
});

describe('수집 할 일 고르기', () => {
  test('보관 기간 = 이번 달(한국 시간)부터 거꾸로 12개월', () => {
    assert.equal(months.length, 12);
    assert.equal(months[0], '2025-12');
    assert.equal(months[11], '2026-11');
    // 한국 시간으로 달이 바뀌는 순간(UTC 11/30 15:00 = 한국 12/1 00:00)
    assert.equal(retentionMonths(new Date('2026-11-30T15:00:00Z'))[11], '2026-12');
  });

  test('처음 보는 시군구는 12개월 × 매매 · 전월세 = 24 묶음, 최근 달 · 매매부터', () => {
    const tasks = planCollectionTasks({ sigunguCodes: ['11710'], months, collections: [], now: NOW });
    assert.equal(tasks.length, 24);
    assert.ok(tasks.every((task) => task.reason === 'BACKFILL'));
    assert.deepEqual(tasks.slice(0, 3).map((t) => `${t.yearMonth} ${t.kind}`), ['2026-11 TRADE', '2026-11 RENT', '2026-10 TRADE']);
  });

  test('다 모은 시군구는 최근 3개월만 다시 — 마지막으로 모은 지 20시간이 지났을 때만', () => {
    const fresh = months.flatMap((month) => ['TRADE', 'RENT'].map((kind) => done('11710', month, kind)));
    assert.equal(planCollectionTasks({ sigunguCodes: ['11710'], months, collections: fresh, now: NOW }).length, 0);
    const stale = months.flatMap((month) => ['TRADE', 'RENT'].map((kind) => done('11710', month, kind, { collectedAgo: REFRESH_MIN_AGE_MS })));
    const tasks = planCollectionTasks({ sigunguCodes: ['11710'], months, collections: stale, now: NOW });
    assert.equal(tasks.length, 6);
    assert.ok(tasks.every((task) => task.reason === 'REFRESH'));
    assert.deepEqual([...new Set(tasks.map((t) => t.yearMonth))].sort(), ['2026-09', '2026-10', '2026-11']);
  });

  test('채우기가 다시 모으기보다 먼저, 그 안에서 오래 안 시도한 묶음부터(실패한 묶음은 시도 시각 기준)', () => {
    const collected = months.flatMap((month) => ['TRADE', 'RENT'].map((kind) => done('11710', month, kind, { collectedAgo: 2 * REFRESH_MIN_AGE_MS })));
    const failedLongAgo = { sigunguCode: '26350', yearMonth: '2026-01', dealKind: 'TRADE', collectedAt: null, attemptedAt: new Date(NOW - 50 * HOUR) };
    const failedRecently = { sigunguCode: '26350', yearMonth: '2026-02', dealKind: 'TRADE', collectedAt: null, attemptedAt: new Date(NOW - HOUR) };
    const tasks = planCollectionTasks({ sigunguCodes: ['11710', '26350'], months, collections: [...collected, failedLongAgo, failedRecently], now: NOW });
    const firstRefresh = tasks.findIndex((t) => t.reason === 'REFRESH');
    assert.ok(tasks.slice(0, firstRefresh).every((t) => t.reason === 'BACKFILL'));
    assert.ok(tasks.slice(firstRefresh).every((t) => t.reason === 'REFRESH'));
    const order = tasks.filter((t) => t.sigunguCode === '26350').map((t) => `${t.yearMonth} ${t.kind}`);
    // 한 번도 안 한 묶음(시도 시각 0) → 50시간 전 실패 → 1시간 전 실패
    assert.ok(order.indexOf('2026-01 TRADE') > order.indexOf('2026-11 TRADE'));
    assert.ok(order.indexOf('2026-02 TRADE') > order.indexOf('2026-01 TRADE'));
    assert.equal(order.at(-1), '2026-02 TRADE');
  });
});
