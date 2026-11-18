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
  // 계약 일정 알림 정기 작업(#159, domains/cron/contractReminders.js)
  RENEWAL_NOTICE_WINDOW_OPEN: 'RENEWAL_NOTICE_WINDOW_OPEN',
  RENEWAL_NOTICE_DEADLINE_SOON: 'RENEWAL_NOTICE_DEADLINE_SOON',
  RENT_PAYMENT_DUE: 'RENT_PAYMENT_DUE',
});

const KNOWN_TYPES = new Set(Object.values(NOTIFICATION_TYPES));

export const isKnownNotificationType = (type) => KNOWN_TYPES.has(type);

const assertKnownType = (type) => {
  if (!KNOWN_TYPES.has(type)) throw new Error(`등록하지 않은 알림 type입니다: ${type}`);
};

const toRow = ({ userId, type, title, body, link = null, related = null, dedupeKey = null }) => ({
  userId,
  type,
  title,
  body,
  link,
  resourceType: related?.resourceType ?? null,
  resourceId: related?.resourceId ?? null,
  dedupeKey,
});

// 알림을 끈 사용자 id 집합(그 type을 mutedTypes에 넣은 사람).
const findMutedUserIds = async (client, type, userIds) => {
  const rows = await client.notificationPreference.findMany({
    where: { userId: { in: userIds }, mutedTypes: { has: type } },
    select: { userId: true },
  });
  return new Set(rows.map((row) => row.userId));
};

// client: 인터랙티브 트랜잭션의 tx(또는 prisma). related: { resourceType, resourceId } | null.
// 등록하지 않은 type은 프로그래밍 실수라 던진다. 받는 사람이 그 type을 껐으면 만들지 않고 null을 돌려준다(7장 mutedTypes).
export const notify = async (client, input) => {
  assertKnownType(input.type);
  const muted = await findMutedUserIds(client, input.type, [input.userId]);
  if (muted.has(input.userId)) return null;
  return client.notification.create({ data: toRow(input) });
};

// 정기 작업용 여러 건 쓰기. 각 항목은 notify 입력 + dedupeKey(필수). 같은 (userId, dedupeKey)가 이미 있으면 건너뛰어
// 정기 작업이 다시 실행돼도 알림이 두 번 가지 않는다. 끈 type은 만들지 않는다. 만든 건수를 돌려준다.
export const notifyMany = async (client, items) => {
  if (items.length === 0) return 0;
  for (const item of items) {
    assertKnownType(item.type);
    if (!item.dedupeKey) throw new Error('notifyMany에는 dedupeKey가 필요합니다.');
  }
  const mutedByType = new Map();
  for (const type of new Set(items.map((item) => item.type))) {
    const userIds = [...new Set(items.filter((item) => item.type === type).map((item) => item.userId))];
    mutedByType.set(type, await findMutedUserIds(client, type, userIds));
  }
  const rows = items.filter((item) => !mutedByType.get(item.type).has(item.userId)).map(toRow);
  if (rows.length === 0) return 0;
  const { count } = await client.notification.createMany({ data: rows, skipDuplicates: true });
  return count;
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
