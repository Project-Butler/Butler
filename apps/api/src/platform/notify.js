// 인앱 알림 쓰기(api-contract.md 7장 "알림", 9장 플랫폼 공유 함수). 알림 행은 여기서만 만든다.
// 쓰기는 호출하는 쪽 트랜잭션(tx) 안에서 해서, 본 작업이 롤백되면 알림도 남지 않게 한다.
// 조회·읽음 처리는 domains/notifications.

// NotificationType(등록형, api-contract.md 10장). 피처가 값을 더할 때 여기에 등록한다.
export const NOTIFICATION_TYPES = Object.freeze({
  CONTRACT_EXPIRING_SOON: 'CONTRACT_EXPIRING_SOON',
  TENANT_INVITATION_ACCEPTED: 'TENANT_INVITATION_ACCEPTED',
  TENANT_INVITATION_VERIFY_FAILED: 'TENANT_INVITATION_VERIFY_FAILED',
  TICKET_CREATED: 'TICKET_CREATED',
  TICKET_STATUS_CHANGED: 'TICKET_STATUS_CHANGED',
  MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
  OWNERSHIP_VERIFIED: 'OWNERSHIP_VERIFIED',
  OWNERSHIP_VERIFICATION_REJECTED: 'OWNERSHIP_VERIFICATION_REJECTED',
  OWNERSHIP_ENDED: 'OWNERSHIP_ENDED',
  SCHEDULE_REMINDER: 'SCHEDULE_REMINDER',
});

const KNOWN_TYPES = new Set(Object.values(NOTIFICATION_TYPES));

// client: 인터랙티브 트랜잭션의 tx(또는 prisma). related: { resourceType, resourceId } | null.
// 등록하지 않은 type은 프로그래밍 실수라 바로 던진다.
export const notify = (client, { userId, type, title, body, link = null, related = null }) => {
  if (!KNOWN_TYPES.has(type)) throw new Error(`등록하지 않은 알림 type입니다: ${type}`);
  return client.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      link,
      resourceType: related?.resourceType ?? null,
      resourceId: related?.resourceId ?? null,
    },
  });
};

export const toNotificationResponse = (notification) => ({
  id: notification.id,
  type: notification.type,
  title: notification.title,
  body: notification.body,
  link: notification.link ?? null,
  related: notification.resourceType
    ? { resourceType: notification.resourceType, resourceId: notification.resourceId ?? null }
    : null,
  readAt: notification.readAt ? notification.readAt.toISOString() : null,
  createdAt: notification.createdAt.toISOString(),
});
