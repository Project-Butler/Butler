import { AppError } from '../../platform/AppError.js';
import { afterCreatedAtCursor, toCursorPage } from '../../platform/createdAtCursor.js';
import { toNotificationResponse } from '../../platform/notify.js';
import { prisma } from '../../platform/prismaClient.js';

// GET /notifications — 본인 것 최신순 커서 방식. size + 1건을 읽어 다음 쪽이 있는지 본다.
export const findMyNotifications = async (user, { unreadOnly, cursor, size }) => {
  const where = { userId: user.id, ...(unreadOnly && { readAt: null }), ...afterCreatedAtCursor(cursor) };
  const rows = await prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: size + 1 });
  const { items, meta } = toCursorPage(rows, size);
  return { items: items.map(toNotificationResponse), meta };
};

export const countMyUnreadNotifications = async (user) => ({
  count: await prisma.notification.count({ where: { userId: user.id, readAt: null } }),
});

// 이미 읽은 알림은 그대로 둔다(멱등). 남의 알림·없는 알림은 같은 404로 존재를 숨긴다.
export const markNotificationRead = async (user, notificationId) => {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId: user.id },
    select: { id: true, readAt: true },
  });
  if (!notification) throw new AppError('NOTIFICATION_NOT_FOUND', 404, '알림을 찾을 수 없습니다.');
  if (!notification.readAt) {
    await prisma.notification.updateMany({ where: { id: notification.id, readAt: null }, data: { readAt: new Date() } });
  }
};

export const markAllNotificationsRead = async (user) => {
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
};
