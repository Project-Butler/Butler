import { ACTIVITY_TYPES, recordActivity } from '../../platform/activityLog.js';
import { AppError } from '../../platform/AppError.js';
import { audit } from '../../platform/audit.js';
import { getTodayKST } from '../../platform/dateUtils.js';
import { lockOwnershipRow } from '../../platform/ownershipLock.js';
import { prisma } from '../../platform/prismaClient.js';
import { toOwnershipResponse, toPropertySummary } from '../../platform/propertySerializer.js';

const PROPERTY_INCLUDE = { property: { include: { complex: true } } };

export const toResponse = (ownership, now = new Date()) =>
  toOwnershipResponse(ownership, toPropertySummary(ownership.property), now);

const throwOwnershipNotFound = () => {
  throw new AppError('OWNERSHIP_NOT_FOUND', 404, '소유 관계를 찾을 수 없습니다.');
};

const throwOwnershipEnded = () => {
  throw new AppError('OWNERSHIP_ENDED', 422, '이미 종료된 소유 관계입니다.');
};

// GET /property-ownerships — 본인 것만, 시작일 최신순.
export const findMyOwnerships = async (user, { active, page, size }) => {
  const where = { userId: user.id };
  if (active === true) where.endedAt = null;
  if (active === false) where.endedAt = { not: null };

  const [ownerships, total] = await prisma.$transaction([
    prisma.ownership.findMany({
      where,
      include: PROPERTY_INCLUDE,
      orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.ownership.count({ where }),
  ]);

  const now = new Date();
  return {
    items: ownerships.map((ownership) => toResponse(ownership, now)),
    meta: { page, size, total, hasNext: page * size < total },
  };
};

// 본인 또는 ADMIN만 볼 수 있다. 그 밖은 null → controller가 404.
export const findOwnershipForUser = async (user, ownershipId) => {
  const ownership = await prisma.ownership.findUnique({ where: { id: ownershipId }, include: PROPERTY_INCLUDE });
  if (!ownership) return null;
  if (ownership.userId !== user.id && user.role !== 'ADMIN') return null;

  return toResponse(ownership);
};

const toActivityParams = (ownership) => ({
  buildingNo: ownership.property.buildingNo,
  unitNo: ownership.property.unitNo,
});

// PATCH /property-ownerships/:ownershipId — 본인의 활성 소유 관계만.
export const updateOwnership = async (user, ownershipId, data) => {
  const { count, ownership } = await prisma.$transaction(async (tx) => {
    const result = await tx.ownership.updateMany({
      where: { id: ownershipId, userId: user.id, endedAt: null },
      data,
    });
    const row = await tx.ownership.findUnique({ where: { id: ownershipId }, include: PROPERTY_INCLUDE });
    if (result.count > 0) {
      await recordActivity(tx, {
        userId: user.id,
        type: ACTIVITY_TYPES.OWNERSHIP_UPDATED,
        complexId: row.property.complexId,
        propertyId: row.propertyId,
        params: { ...toActivityParams(row), fields: Object.keys(data) },
      });
    }
    return { count: result.count, ownership: row };
  });

  if (!ownership || ownership.userId !== user.id) throwOwnershipNotFound();
  // count 0인데 본인 것이면 이미 종료된 소유 관계다.
  if (count === 0) throwOwnershipEnded();

  return toResponse(ownership);
};

// 소유 관계 종료(트랜잭션 안). 사용자 종료(SELF_ENDED)와 운영자 종료(ADMIN_ENDED)가 함께 쓴다.
// checkActiveContracts: 사용자 종료만 true — 운영자 종료는 계약이 있어도 진행한다(api-contract.md 3장 "소유 관계 상태 규칙").
// 없는 소유 관계·본인 확인은 호출하는 쪽이 먼저 한다. 종료된 행(property·complex 포함)을 돌려준다.
export const endOwnershipInTx = async (tx, ownership, { endReason, note, checkActiveContracts }) => {
  if (ownership.endedAt) throwOwnershipEnded();

  if (checkActiveContracts) {
    // 시작 전·진행 중 계약 = 해지되지 않았고 종료일이 오늘(KST) 이후.
    // contractStatus.js의 UPCOMING·ACTIVE·EXPIRING_SOON과 같은 조건이다 — 규칙이 바뀌면 함께 수정할 것.
    // endDate는 @db.Date(UTC 자정 Date)라 오늘(KST)도 UTC 자정 Date로 만들어 비교한다.
    const activeContract = await tx.contract.findFirst({
      where: {
        ownershipId: ownership.id,
        terminatedOn: null,
        endDate: { gte: new Date(`${getTodayKST()}T00:00:00Z`) },
      },
      select: { id: true },
    });
    if (activeContract) {
      throw new AppError(
        'OWNERSHIP_HAS_ACTIVE_CONTRACTS',
        422,
        '시작 전이거나 진행 중인 계약이 있어 소유를 종료할 수 없습니다. 계약을 먼저 해지해 주세요.',
      );
    }
  }

  // 동시에 종료 요청이 와도 한 번만 종료되도록 endedAt null 조건을 건다.
  const { count } = await tx.ownership.updateMany({
    where: { id: ownership.id, endedAt: null },
    data: { endedAt: new Date(), endReason, endNote: note },
  });
  if (count === 0) throwOwnershipEnded();

  return tx.ownership.findUnique({ where: { id: ownership.id }, include: PROPERTY_INCLUDE });
};

// POST /property-ownerships/:ownershipId/end — 조회·활성 계약 확인·종료를 한 트랜잭션으로 한다.
export const endOwnership = async (user, ownershipId, { reason }, req) => {
  const ended = await prisma.$transaction(async (tx) => {
    // 계약 등록·수정·해지와 같은 행 잠금으로 줄을 세운다(종료된 소유 관계에 진행 중 계약이 붙지 않게).
    const ownership = await lockOwnershipRow(tx, ownershipId);
    if (!ownership || ownership.userId !== user.id) throwOwnershipNotFound();

    const endedRow = await endOwnershipInTx(tx, ownership, { endReason: 'SELF_ENDED', note: reason, checkActiveContracts: true });
    await recordActivity(tx, {
      userId: user.id,
      type: ACTIVITY_TYPES.OWNERSHIP_ENDED,
      complexId: endedRow.property.complexId,
      propertyId: endedRow.propertyId,
      params: toActivityParams(endedRow),
    });
    await audit.record({
      actor: user,
      action: 'OWNERSHIP_ENDED',
      resourceType: 'OWNERSHIP',
      resourceId: ownershipId,
      after: { endReason: 'SELF_ENDED', reason },
      req,
      client: tx,
    });
    return endedRow;
  });

  return toResponse(ended);
};
