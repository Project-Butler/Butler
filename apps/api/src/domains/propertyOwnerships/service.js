import { ACTIVITY_TYPES, recordActivity } from '../../platform/activityLog.js';
import { AppError } from '../../platform/AppError.js';
import { audit } from '../../platform/audit.js';
import { getNow } from '../../platform/dateUtils.js';
import { endOwnershipInTx, removeLogsInTx } from '../../platform/ownershipEnd.js';
import { lockOwnershipRow } from '../../platform/ownershipLock.js';
import { prisma } from '../../platform/prismaClient.js';
import { toOwnershipResponse, toPropertySummary } from '../../platform/propertySerializer.js';
import { removeStoredObjects } from '../documents/storage/index.js';

const PROPERTY_INCLUDE = { property: { include: { complex: true } } };

export const toResponse = (ownership, now = new Date()) =>
  toOwnershipResponse(ownership, toPropertySummary(ownership.property), now);

const throwOwnershipNotFound = () => {
  throw new AppError('OWNERSHIP_NOT_FOUND', 404, '소유 관계를 찾을 수 없습니다.');
};

const throwOwnershipEnded = () => {
  throw new AppError('OWNERSHIP_ENDED', 422, '이미 종료된 소유 관계입니다.');
};

// GET /property-ownerships — 본인 것만, 시작일 최신순. 목록에서 지운 소유 관계(removedAt)는 뺀다.
export const findMyOwnerships = async (user, { active, page, size }) => {
  const where = { userId: user.id, removedAt: null };
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

  const now = getNow();
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

// POST /property-ownerships/:ownershipId/end — 조회·활성 계약 확인·종료를 한 트랜잭션으로 한다.
// SOLD는 진행 중 계약이 있어도 끝나고 계약은 읽기 전용으로 남는다(증명은 하지 않는다).
// 인증한 적 없는 소유 관계면 하우스 로그가 지워지고(H-37) 첨부 파일은 커밋 뒤 지운다.
export const endOwnership = async (user, ownershipId, { reason, endReason = 'SELF_ENDED' }, req) => {
  const { ended, removedPaths } = await prisma.$transaction(async (tx) => {
    // 계약 등록·수정·해지와 같은 행 잠금으로 줄을 세운다(종료된 소유 관계에 진행 중 계약이 붙지 않게).
    const ownership = await lockOwnershipRow(tx, ownershipId);
    if (!ownership || ownership.userId !== user.id) throwOwnershipNotFound();

    const { ownership: endedRow, removedPaths: paths } = await endOwnershipInTx(tx, ownership, {
      endReason,
      note: reason,
      checkActiveContracts: endReason === 'SELF_ENDED',
    });
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
      after: { endReason, reason },
      req,
      client: tx,
    });
    return { ended: endedRow, removedPaths: paths };
  });

  await removeStoredObjects(removedPaths);
  return toResponse(ended);
};

// POST /property-ownerships/:ownershipId/remove — 끝난 내 소유 관계를 목록에서 지운다(H-41).
// 그 관계의 나만 보기 기록·첨부를 지우고(파일은 커밋 뒤), 그 관계에서 만든 숨김을 지우고, removedAt을 남긴다.
// 계약·계약 문서·소유 서류는 지우지 않는다(목록·검색·서류함에서만 빠진다). 넘어간 호실 이력은 다음 소유자에게 그대로다.
// 활성 소유 관계는 422 OWNERSHIP_ACTIVE, 이미 지웠으면 그대로 성공(204).
export const removeOwnership = async (user, ownershipId, req) => {
  const removedPaths = await prisma.$transaction(async (tx) => {
    const ownership = await lockOwnershipRow(tx, ownershipId);
    if (!ownership || ownership.userId !== user.id) throwOwnershipNotFound();
    if (!ownership.endedAt) {
      throw new AppError('OWNERSHIP_ACTIVE', 422, '소유 중인 호실은 목록에서 지울 수 없어요. 소유를 먼저 종료해 주세요.');
    }
    if (ownership.removedAt) return [];

    const now = getNow();
    const paths = await removeLogsInTx(tx, { ownershipId, scope: 'PRIVATE' }, now);
    await tx.propertyLogHide.deleteMany({ where: { ownershipId } });
    await tx.ownership.update({ where: { id: ownershipId }, data: { removedAt: now } });
    await audit.record({ actor: user, action: 'OWNERSHIP_REMOVED', resourceType: 'OWNERSHIP', resourceId: ownershipId, req, client: tx });
    return paths;
  });
  await removeStoredObjects(removedPaths);
};
