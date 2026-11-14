import { prisma } from '../../platform/prismaClient.js';
import { countActiveUnitsByComplex, toRemainingCount } from '../landlordBuildings/unitCounts.js';
import { buildSetupSteps } from './setupProgress.js';

// GET /dashboard/landlord/setup — 집계 쿼리 5개(건물 설정, 활성 소유 관계 수, 계약 수, 수락된 초대 수, 단지별 등록 수).
export const findLandlordSetup = async (user) => {
  const [buildings, propertyCount, contractCount, acceptedInvitationCount] = await Promise.all([
    prisma.myBuilding.findMany({
      where: { userId: user.id, deletedAt: null },
      select: { id: true, complexId: true, name: true, capacity: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.ownership.count({ where: { userId: user.id, endedAt: null } }),
    prisma.contract.count({ where: { terminatedOn: null, ownership: { userId: user.id, endedAt: null } } }),
    prisma.tenantInvitation.count({ where: { status: 'ACCEPTED', contract: { ownership: { userId: user.id, endedAt: null } } } }),
  ]);
  const counts = await countActiveUnitsByComplex(
    prisma,
    user.id,
    buildings.map((building) => building.complexId),
  );

  return {
    ...buildSetupSteps({ propertyCount, contractCount, acceptedInvitationCount }),
    buildings: buildings.map((building) => {
      const count = counts.get(building.complexId) ?? 0;
      return {
        id: building.id,
        name: building.name,
        propertyCount: count,
        capacity: building.capacity ?? null,
        remainingCount: toRemainingCount(building.capacity, count),
      };
    }),
  };
};
