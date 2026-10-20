// 최근 활동(activity_logs) 기록·응답. 문장은 저장하지 않고 화면이 type + params로 만든다.
// 쓰기는 호출하는 쪽 트랜잭션(tx) 안에서 해서, 본 작업이 롤백되면 활동도 남지 않게 한다.

export const ACTIVITY_TYPES = Object.freeze({
  LANDLORD_BUILDING_CREATED: 'LANDLORD_BUILDING_CREATED',
  LANDLORD_BUILDING_UPDATED: 'LANDLORD_BUILDING_UPDATED',
  LANDLORD_BUILDING_DELETED: 'LANDLORD_BUILDING_DELETED',
  PROPERTY_REGISTERED: 'PROPERTY_REGISTERED',
  PROPERTY_UPDATED: 'PROPERTY_UPDATED',
  OWNERSHIP_UPDATED: 'OWNERSHIP_UPDATED',
  OWNERSHIP_ENDED: 'OWNERSHIP_ENDED',
});

// client: prisma 또는 인터랙티브 트랜잭션의 tx. params에는 건물명·동·호 원문처럼 화면 문장에 필요한 값만.
export const recordActivity = (client, { userId, type, complexId = null, propertyId = null, params = {} }) =>
  client.activityLog.create({ data: { userId, type, complexId, propertyId, params } });

export const toActivityResponse = (activity) => ({
  id: activity.id,
  type: activity.type,
  complexId: activity.complexId ?? null,
  propertyId: activity.propertyId ?? null,
  params: activity.params ?? {},
  createdAt: activity.createdAt.toISOString(),
});
