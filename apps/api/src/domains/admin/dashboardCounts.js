// GET /admin/dashboard 카운트 정리. Prisma groupBy 결과에는 0건인 값이 빠지므로 enum 값마다 0을 채운다.
// rows: [{ <key>: 'ACTIVE', _count: { _all: 3 } }, ...]
export const toCountMap = (rows, key, values) => {
  const counts = Object.fromEntries(values.map((value) => [value, 0]));
  for (const row of rows) counts[row[key]] = row._count._all;
  return counts;
};

export const sumCounts = (counts) => Object.values(counts).reduce((sum, count) => sum + count, 0);

// 소유 관계 인증 상태별 카운트. EXPIRED는 DB에 없어서(platform/ownershipStatus.js)
// 저장값 VERIFIED 중 verificationExpiresAt이 지난 수를 따로 세어 VERIFIED에서 옮긴다.
export const splitExpiredOwnerships = (counts, expiredCount) => ({
  UNVERIFIED: counts.UNVERIFIED,
  VERIFIED: counts.VERIFIED - expiredCount,
  EXPIRED: expiredCount,
  REVOKED: counts.REVOKED,
});
