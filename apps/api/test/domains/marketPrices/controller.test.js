import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { formatCollectionLog } from '../../../src/domains/marketPrices/controller.js';

describe('정기 실행 결과 로그 한 줄', () => {
  const summary = {
    targets: 4,
    planned: 30,
    backfill: 26,
    done: 18,
    failed: 12,
    skipped: 0,
    calls: 31,
    saved: 900,
    linked: 120,
    cancelled: 2,
    relinked: 0,
    jobsCompleted: 0,
    elapsedMs: 41234,
    failures: Array.from({ length: 12 }, (_, index) => `11710 2026-${String(index + 1).padStart(2, '0')} RENT TIMEOUT`),
  };

  test('한 줄 · 머리 [market-prices] cron · 정한 칸만(targets · planned · backfill · done · failed · failures · calls · elapsedMs)', () => {
    const line = formatCollectionLog(summary);
    assert.ok(!line.includes('\n'));
    assert.match(line, /^\[market-prices\] cron \{/);
    const logged = JSON.parse(line.slice('[market-prices] cron '.length));
    assert.deepEqual(Object.keys(logged), ['targets', 'planned', 'backfill', 'done', 'failed', 'failures', 'calls', 'elapsedMs']);
    assert.deepEqual([logged.targets, logged.planned, logged.backfill, logged.done, logged.failed, logged.calls, logged.elapsedMs], [4, 30, 26, 18, 12, 31, 41234]);
    assert.equal(logged.failures.length, 10); // 앞 10개만
    assert.equal(logged.failures[0], '11710 2026-01 RENT TIMEOUT');
  });

  test('실패 없음 · failures 가 없어도 한 줄(빈 배열)', () => {
    const logged = JSON.parse(formatCollectionLog({ ...summary, failed: 0, failures: undefined }).slice('[market-prices] cron '.length));
    assert.deepEqual(logged.failures, []);
  });
});
