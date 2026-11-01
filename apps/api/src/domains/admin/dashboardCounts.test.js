import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitExpiredOwnerships, sumCounts, toCountMap } from './dashboardCounts.js';

test('groupBy에 없는 값은 0으로 채운다', () => {
  const rows = [{ status: 'ACTIVE', _count: { _all: 3 } }];
  assert.deepEqual(toCountMap(rows, 'status', ['ACTIVE', 'SUSPENDED', 'WITHDRAWN']), {
    ACTIVE: 3,
    SUSPENDED: 0,
    WITHDRAWN: 0,
  });
});

test('합계', () => {
  assert.equal(sumCounts({ A: 1, B: 2, C: 0 }), 3);
});

test('만료된 인증은 VERIFIED에서 EXPIRED로 옮긴다', () => {
  assert.deepEqual(splitExpiredOwnerships({ UNVERIFIED: 2, VERIFIED: 5, REVOKED: 1 }, 2), {
    UNVERIFIED: 2,
    VERIFIED: 3,
    EXPIRED: 2,
    REVOKED: 1,
  });
});
