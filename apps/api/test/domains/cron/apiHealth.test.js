import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldAlertConsecutiveFailure } from '../../../src/domains/cron/apiHealth.js';

test('직전 점검이 없고(첫 실행) 이번에 실패 → 경보 안 함', () => {
  assert.equal(shouldAlertConsecutiveFailure(true, null), false);
});

test('직전 성공 + 이번 실패 → 경보 안 함', () => {
  assert.equal(shouldAlertConsecutiveFailure(true, { status: 'SUCCEEDED' }), false);
});

test('직전 실패 + 이번 실패 → 경보', () => {
  assert.equal(shouldAlertConsecutiveFailure(true, { status: 'FAILED' }), true);
});

test('직전 실패 + 이번 성공 → 경보 안 함', () => {
  assert.equal(shouldAlertConsecutiveFailure(false, { status: 'FAILED' }), false);
});

test('진행 중(PROCESSING) 행은 직전 완료 점검으로 보지 않는다', () => {
  assert.equal(shouldAlertConsecutiveFailure(true, { status: 'PROCESSING' }), false);
});

test('juso 변동분: 마지막 성공이 3일 이내면 OK, 넘으면 STALE, 없으면 STALE', async () => {
  const { isDeltaStale } = await import('../../../src/domains/cron/apiHealth.js');
  assert.equal(isDeltaStale('2026-10-18', '2026-10-20'), false);
  assert.equal(isDeltaStale('2026-10-17', '2026-10-20'), false);
  assert.equal(isDeltaStale('2026-10-16', '2026-10-20'), true);
  assert.equal(isDeltaStale(null, '2026-10-20'), true);
});

test('juso 변동 STALE은 공식 연계 커서를 본다(연계 기준일 - 1로 잰다)', async () => {
  const { checkDeltaFreshness } = await import('../../../src/domains/cron/apiHealth.js');
  const sources = [];
  const prismaOf = (ymd) => ({
    dataImport: {
      findFirst: async ({ where }) => {
        sources.push(where.source);
        return ymd ? { fileDate: new Date(`${ymd}T00:00:00Z`) } : null;
      },
    },
  });
  assert.equal((await checkDeltaFreshness(prismaOf(null))).status, 'STALE');
  assert.equal((await checkDeltaFreshness(prismaOf('2020-01-01'))).status, 'STALE');
  assert.deepEqual(sources, ['JUSO_LINK', 'JUSO_LINK']);
});
