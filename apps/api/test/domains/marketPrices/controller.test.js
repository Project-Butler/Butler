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

  // #233 — 키 오류로 실패한 묶음이 있을 때만 키 모양(길이 · 참/거짓). 가짜 16진수 키 — 실제 키가 아니다
  const HEX = '0123456789abcdef'.repeat(4);
  const parse = (line) => JSON.parse(line.slice('[market-prices] cron '.length));

  test('키 오류(30 · NO_KEY)로 실패한 묶음이 있으면 끝에 keyShape — 키 글자는 없다', () => {
    for (const code of ['30', 'NO_KEY']) {
      const line = formatCollectionLog({ ...summary, failures: ['11350 2026-09 RENT TIMEOUT', `11350 2026-10 TRADE ${code}`] }, `"${HEX}"\n`);
      assert.ok(!line.includes('\n'));
      const logged = parse(line);
      assert.deepEqual(Object.keys(logged), ['targets', 'planned', 'backfill', 'done', 'failed', 'failures', 'calls', 'elapsedMs', 'keyShape']);
      assert.deepEqual(logged.keyShape, { rawLength: 67, cleanedLength: 64, hadWhitespace: true, hadQuotes: true, hadPercent: false, cleanedIsHex: true });
      for (let index = 0; index + 8 <= HEX.length; index += 4) assert.ok(!line.includes(HEX.slice(index, index + 8)), `${code} ${HEX.slice(index, index + 8)}`);
    }
  });

  test('키 오류가 아니면(TIMEOUT 만 · 실패 없음) keyShape 칸이 없다', () => {
    for (const failures of [['11350 2026-10 TRADE TIMEOUT', '11350 2026-10 RENT 23'], []]) {
      assert.ok(!('keyShape' in parse(formatCollectionLog({ ...summary, failures }, HEX))));
    }
  });
});
