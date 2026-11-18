// 알림 설정(api-contract.md 7장 notification-preferences, #159). 본인 것만. 행이 없으면 기본값으로 답한다.
import { prisma } from '../../platform/prismaClient.js';

const DEFAULT_PREFERENCE = { webPushEnabled: true, mutedTypes: [] };

const toPreferenceResponse = (row) => ({
  webPushEnabled: row?.webPushEnabled ?? DEFAULT_PREFERENCE.webPushEnabled,
  mutedTypes: row?.mutedTypes ?? DEFAULT_PREFERENCE.mutedTypes,
});

// GET /notification-preferences
export const findMyPreference = async (user) =>
  toPreferenceResponse(await prisma.notificationPreference.findUnique({ where: { userId: user.id } }));

// PATCH /notification-preferences — 보낸 칸만 바꾼다. 처음이면 기본값에 보낸 칸을 덮어 만든다.
export const updateMyPreference = async (user, input) => {
  const row = await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...DEFAULT_PREFERENCE, ...input },
    update: input,
  });
  return toPreferenceResponse(row);
};
