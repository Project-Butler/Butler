import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeOwnershipVerificationStatus } from '../../../src/platform/ownershipStatus.js';
import { toVerificationStatusWhere } from '../../../src/domains/admin/ownershipFilter.js';

const NOW = new Date('2026-11-02T00:00:00.000Z');

// where 조건을 메모리에서 평가해 ownershipStatus.js 계산과 같은 결과인지 본다.
const matches = (where, row) => {
  if (where.verificationStatus && row.verificationStatus !== where.verificationStatus) return false;
  const expiresAt = row.verificationExpiresAt;
  if (where.verificationExpiresAt?.lt && !(expiresAt && expiresAt < where.verificationExpiresAt.lt)) return false;
  if (where.OR && !(expiresAt === null || expiresAt >= where.OR[1].verificationExpiresAt.gte)) return false;
  return true;
};

const ROWS = [
  { verificationStatus: 'UNVERIFIED', verificationExpiresAt: null },
  { verificationStatus: 'VERIFIED', verificationExpiresAt: null },
  { verificationStatus: 'VERIFIED', verificationExpiresAt: new Date('2026-12-01T00:00:00.000Z') },
  { verificationStatus: 'VERIFIED', verificationExpiresAt: NOW },
  { verificationStatus: 'VERIFIED', verificationExpiresAt: new Date('2026-11-01T00:00:00.000Z') },
  { verificationStatus: 'REVOKED', verificationExpiresAt: null },
];

test('필터 결과가 조회 시점 계산(computeOwnershipVerificationStatus)과 같다', () => {
  for (const status of ['UNVERIFIED', 'VERIFIED', 'EXPIRED', 'REVOKED']) {
    const where = toVerificationStatusWhere(status, NOW);
    for (const row of ROWS) {
      assert.equal(matches(where, row), computeOwnershipVerificationStatus(row, NOW) === status, `${status} ${JSON.stringify(row)}`);
    }
  }
});

test('필터가 없으면 조건 없음', () => {
  assert.deepEqual(toVerificationStatusWhere(undefined, NOW), {});
});
