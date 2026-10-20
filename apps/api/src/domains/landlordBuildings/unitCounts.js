// 건물 설정의 "등록 수" = 그 단지 안에서 내 활성 소유 관계 수.
// 건물 설정 목록·초기 세팅·호실 등록 정원 검사가 같은 규칙을 쓴다.
import { Prisma } from '@prisma/client';

// client: prisma 또는 tx. 결과 Map(complexId → 수). 쿼리 1번(그룹 집계, N+1 없음).
export const countActiveUnitsByComplex = async (client, userId, complexIds) => {
  const counts = new Map();
  if (complexIds.length === 0) return counts;

  const rows = await client.$queryRaw`
    SELECT p.complex_id::text AS "complexId", COUNT(*)::int AS count
    FROM property_ownerships o
    JOIN properties p ON p.id = o.property_id
    WHERE o.user_id = ${userId}::uuid
      AND o.ended_at IS NULL
      AND p.complex_id = ANY(${complexIds}::uuid[])
    GROUP BY p.complex_id`;
  for (const row of rows) counts.set(row.complexId, row.count);
  return counts;
};

export const countActiveUnitsInComplex = async (client, userId, complexId) =>
  (await countActiveUnitsByComplex(client, userId, [complexId])).get(complexId) ?? 0;

// 정원이 없으면 null(남은 수를 셀 수 없음). 등록 수가 정원보다 많아도 음수로 내려주지 않는다.
export const toRemainingCount = (capacity, propertyCount) =>
  capacity === null || capacity === undefined ? null : Math.max(capacity - propertyCount, 0);

// 인터랙티브 트랜잭션 안에서 건물 설정 행을 잠근다(정원 검사와 등록·정원 수정이 줄을 서게).
// 없으면 null.
export const lockLandlordBuilding = async (tx, where) => {
  const condition = where.id
    ? Prisma.sql`id = ${where.id}::uuid AND user_id = ${where.userId}::uuid`
    : Prisma.sql`user_id = ${where.userId}::uuid AND complex_id = ${where.complexId}::uuid`;
  const rows = await tx.$queryRaw`
    SELECT id::text AS id, complex_id::text AS "complexId", name, capacity
    FROM landlord_buildings
    WHERE ${condition}
    FOR UPDATE`;
  return rows[0] ?? null;
};
