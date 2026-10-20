import { toActivityResponse } from '../../platform/activityLog.js';
import { prisma } from '../../platform/prismaClient.js';

// GET /activities — 본인 것 최신순, size개.
export const findMyActivities = async (user, { size }) => {
  const activities = await prisma.activityLog.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: size,
  });
  return activities.map(toActivityResponse);
};
