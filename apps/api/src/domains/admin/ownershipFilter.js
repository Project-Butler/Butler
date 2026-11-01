// GET /admin/property-ownerships의 verificationStatus 필터 → Prisma where.
// EXPIRED는 DB에 저장하지 않으므로(platform/ownershipStatus.js) 저장값 VERIFIED를 만료 시각으로 나눈다.
// ownershipStatus.js는 now > verificationExpiresAt이면 EXPIRED라서 여기서도 lt: now / gte: now로 나눈다.
export const OWNERSHIP_FILTER_STATUSES = ['UNVERIFIED', 'VERIFIED', 'EXPIRED', 'REVOKED'];

export const toVerificationStatusWhere = (verificationStatus, now) => {
  if (verificationStatus === 'EXPIRED') {
    return { verificationStatus: 'VERIFIED', verificationExpiresAt: { lt: now } };
  }
  if (verificationStatus === 'VERIFIED') {
    return {
      verificationStatus: 'VERIFIED',
      OR: [{ verificationExpiresAt: null }, { verificationExpiresAt: { gte: now } }],
    };
  }
  return verificationStatus ? { verificationStatus } : {};
};
