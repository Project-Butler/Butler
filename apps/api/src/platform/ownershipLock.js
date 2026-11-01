// 소유 관계 행 잠금. 계약 쓰기(등록·수정·해지)와 소유 종료가 같은 행 잠금으로 줄을 서게 해서
// "종료된 소유 관계에 진행 중 계약이 붙는" 경쟁을 막는다(.omc/plans/4-contract-management.md 2장 A1).
// 인터랙티브 트랜잭션(tx) 안에서만 부른다. 없으면 null.
export const lockOwnershipRow = async (tx, ownershipId) => {
  const rows = await tx.$queryRaw`
    SELECT id::text AS id,
           user_id::text AS "userId",
           property_id::text AS "propertyId",
           ended_at AS "endedAt",
           verification_status::text AS "verificationStatus",
           verification_expires_at AS "verificationExpiresAt"
    FROM ownerships
    WHERE id = ${ownershipId}::uuid
    FOR UPDATE`;
  return rows[0] ?? null;
};
