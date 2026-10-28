// 최근 활동(activities) 기록·응답. 문장은 저장하지 않고 화면이 type + params로 만든다.
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
// 단지가 있고 건물명을 넘기지 않았으면 그 사용자의 건물 설정 이름을 붙인다("항여울 117동 516호를 삭제했어요").
export const recordActivity = async (client, { userId, type, complexId = null, propertyId = null, params = {} }) => {
  let finalParams = params;
  if (complexId && params.buildingName === undefined && client.myBuilding) {
    const building = await client.myBuilding.findUnique({
      where: { userId_complexId: { userId, complexId } },
      select: { name: true },
    });
    if (building) finalParams = { buildingName: building.name, ...params };
  }
  return client.activity.create({ data: { userId, type, complexId, propertyId, params: finalParams } });
};

export const toActivityResponse = (activity) => ({
  id: activity.id,
  type: activity.type,
  complexId: activity.complexId ?? null,
  propertyId: activity.propertyId ?? null,
  params: activity.params ?? {},
  createdAt: activity.createdAt.toISOString(),
});
