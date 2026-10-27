// api-contract.md 9장 플랫폼 공유 함수 getActiveOwnership(userId, propertyId).
// 같은 호실에 내 활성 소유 관계(endedAt null)는 최대 1개다(uq_ownership_active_user).
import { prisma } from './prismaClient.js';
import { isUuid } from './uuid.js';

// Prisma PropertyOwnership 그대로 돌려주고, 없으면 null.
// 주의: verificationStatus는 DB 저장값이다 — 만료(EXPIRED) 판단이 필요하면
// ownershipStatus.js의 computeOwnershipVerificationStatus()로 계산해서 쓴다.
export const getActiveOwnership = async (userId, propertyId) => {
  if (!isUuid(userId) || !isUuid(propertyId)) return null;

  return prisma.ownership.findFirst({
    where: { userId, propertyId, endedAt: null },
  });
};
