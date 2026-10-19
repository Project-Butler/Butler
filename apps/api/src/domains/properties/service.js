import { Prisma } from '@prisma/client';
import { AppError } from '../../platform/AppError.js';
import { computeOwnershipVerificationStatus } from '../../platform/ownershipStatus.js';
import { prisma } from '../../platform/prismaClient.js';
import { resolveMyRelation, toOwnershipResponse, toPropertySummary } from '../../platform/propertySerializer.js';

const CONTRACT_ID_SELECT = { select: { id: true } };

const toPropertyResponse = (property, myRelation) => ({
  ...toPropertySummary(property),
  myRelation,
  createdAt: property.createdAt.toISOString(),
});

const toPageMeta = (page, size, total) => ({ page, size, total, hasNext: page * size < total });

// 요청자와 이 호실의 관계(myRelation)를 계산하는 데 필요한 행만 읽는다.
// 다른 사람의 소유 관계는 조회하지 않는다 — 어떤 응답에도 드러나지 않아야 한다(api-contract.md 3장).
const loadMyRelation = async (user, propertyId) => {
  const [ownerships, tenantContracts] = await Promise.all([
    prisma.propertyOwnership.findMany({
      where: { propertyId, userId: user.id },
      include: { contracts: CONTRACT_ID_SELECT },
    }),
    prisma.contract.findMany({
      where: { tenantId: user.id, ownership: { propertyId } },
      select: { id: true },
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
    }),
  ]);
  return resolveMyRelation({ role: user.role, ownerships, tenantContracts });
};

const throwOwnershipAlreadyExists = () => {
  throw new AppError('OWNERSHIP_ALREADY_EXISTS', 409, '이미 등록한 부동산입니다.');
};

const isUniqueViolation = (error) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

// POST /properties — 호실(없으면 생성) + 내 UNVERIFIED 소유 관계를 한 트랜잭션으로 만든다.
//
// 유니크 충돌(P2002)은 트랜잭션 밖에서 처리한다. 실패한 트랜잭션 안에서 다시 조회하면
// Postgres가 25P02(current transaction is aborted)를 던지기 때문이다. 어느 단계에서
// 충돌했는지는 stage로 판별한다(meta.target은 로그에만 남긴다).
// - ownershipCreate: 같은 호실에 내 활성 소유 관계가 동시에 생김 → 바로 409
// - propertyUpsert: 다른 요청이 같은 호실을 먼저 만듦 → 트랜잭션 전체를 1회 재시도
export const createPropertyWithOwnership = async (user, input) => {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let stage = 'start';
    try {
      const { property, ownership } = await prisma.$transaction(async (tx) => {
        const complex = await tx.complex.findUnique({ where: { id: input.complexId } });
        if (!complex) throw new AppError('COMPLEX_NOT_FOUND', 404, '단지를 찾을 수 없습니다.');

        stage = 'propertyUpsert';
        const upserted = await tx.property.upsert({
          where: {
            complexId_buildingNo_unitNo: {
              complexId: input.complexId,
              buildingNo: input.buildingNo,
              unitNo: input.unitNo,
            },
          },
          create: {
            complexId: input.complexId,
            buildingNo: input.buildingNo,
            unitNo: input.unitNo,
            exclusiveArea: input.exclusiveArea,
            floor: input.floor,
          },
          update: {},
        });

        // 이미 있던 호실이면 비어 있는 면적·층만 채운다(채워진 값은 요청 값으로 덮지 않음).
        stage = 'propertyFill';
        if (input.exclusiveArea != null) {
          await tx.property.updateMany({
            where: { id: upserted.id, exclusiveArea: null },
            data: { exclusiveArea: input.exclusiveArea },
          });
        }
        if (input.floor != null) {
          await tx.property.updateMany({
            where: { id: upserted.id, floor: null },
            data: { floor: input.floor },
          });
        }
        // 채운 뒤 다시 읽어서 201 응답이 최신 값을 담게 한다.
        const filled = await tx.property.findUnique({ where: { id: upserted.id }, include: { complex: true } });

        const existing = await tx.propertyOwnership.findFirst({
          where: { propertyId: upserted.id, userId: user.id, endedAt: null },
          select: { id: true },
        });
        if (existing) throwOwnershipAlreadyExists();

        stage = 'ownershipCreate';
        const created = await tx.propertyOwnership.create({
          data: {
            propertyId: upserted.id,
            userId: user.id,
            acquiredYearMonth: input.acquiredYearMonth,
            purchasePrice: input.purchasePrice,
            verificationStatus: 'UNVERIFIED',
          },
        });

        return { property: filled, ownership: created };
      });

      // TODO(audit): OWNERSHIP_CREATED — audit.record()가 생기면 여기서 기록한다.
      const now = new Date();
      const summary = toPropertySummary(property);
      return {
        property: toPropertyResponse(property, {
          type: 'OWNER',
          ownershipId: ownership.id,
          verificationStatus: computeOwnershipVerificationStatus(ownership, now),
          contractIds: [],
        }),
        ownership: toOwnershipResponse(ownership, summary, now),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error?.code === 'P2003') {
        // 참조 대상(사용자·단지)이 DB에 없으면 FK 위반이 난다. 응답은 500 그대로 둔다.
        console.warn('[properties] FK 위반 — 참조 대상(사용자·단지)이 DB에 없습니다.');
      }
      if (!isUniqueViolation(error)) throw error;

      console.warn('[properties] P2002', stage, error.meta?.target);
      if (stage === 'ownershipCreate') throwOwnershipAlreadyExists();
      if (stage === 'propertyUpsert' && attempt === 1) continue;
      throw error;
    }
  }
};

// relation=OWNER — 내 활성 소유 관계를 시작일 최신순으로.
const findOwnerProperties = async (user, page, size) => {
  const where = { userId: user.id, endedAt: null };
  const [ownerships, total] = await prisma.$transaction([
    prisma.propertyOwnership.findMany({
      where,
      include: { property: { include: { complex: true } }, contracts: CONTRACT_ID_SELECT },
      orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.propertyOwnership.count({ where }),
  ]);

  const now = new Date();
  const items = ownerships.map((ownership) =>
    toPropertyResponse(ownership.property, {
      type: 'OWNER',
      ownershipId: ownership.id,
      verificationStatus: computeOwnershipVerificationStatus(ownership, now),
      contractIds: ownership.contracts.map((contract) => contract.id),
    }),
  );
  return { items, meta: toPageMeta(page, size, total) };
};

// relation=FORMER_OWNER — 지금은 소유하지 않는 호실마다 가장 최근에 끝난 내 소유 관계 1개.
// 호실별 1행을 고르는 DISTINCT ON은 Prisma 쿼리로 표현할 수 없어서 $queryRaw를 쓴다.
const formerOwnerCte = (userId) => Prisma.sql`
  WITH latest AS (
    SELECT DISTINCT ON (o.property_id) o.property_id, o.id AS ownership_id, o.ended_at AS relation_at
    FROM property_ownerships o
    WHERE o.user_id = ${userId}::uuid
      AND o.ended_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM property_ownerships a
        WHERE a.property_id = o.property_id AND a.user_id = ${userId}::uuid AND a.ended_at IS NULL
      )
    ORDER BY o.property_id, o.ended_at DESC
  )`;

// relation=TENANT — 내가 임차인인 계약이 있는 호실마다 가장 최근에 시작한 계약 1개.
const tenantCte = (userId) => Prisma.sql`
  WITH latest AS (
    SELECT DISTINCT ON (o.property_id) o.property_id, c.start_date AS relation_at
    FROM contracts c
    JOIN property_ownerships o ON o.id = c.ownership_id
    WHERE c.tenant_id = ${userId}::uuid
    ORDER BY o.property_id, c.start_date DESC
  )`;

// CTE에서 관계 날짜 최신순 + property_id로 한 페이지를 고르고, total은 같은 CTE의 COUNT(*).
const pagePropertyIds = async (cte, page, size) => {
  const [rows, countRows] = await prisma.$transaction([
    prisma.$queryRaw`${cte}
      SELECT property_id::text AS "propertyId"
      FROM latest
      ORDER BY relation_at DESC, property_id ASC
      LIMIT ${size} OFFSET ${(page - 1) * size}`,
    prisma.$queryRaw`${cte} SELECT COUNT(*)::int AS total FROM latest`,
  ]);
  return { propertyIds: rows.map((row) => row.propertyId), total: countRows[0].total };
};

const findFormerOwnerProperties = async (user, page, size) => {
  const { propertyIds, total } = await pagePropertyIds(formerOwnerCte(user.id), page, size);

  const [properties, ownerships] = await Promise.all([
    prisma.property.findMany({ where: { id: { in: propertyIds } }, include: { complex: true } }),
    prisma.propertyOwnership.findMany({
      where: { userId: user.id, propertyId: { in: propertyIds } },
      include: { contracts: CONTRACT_ID_SELECT },
    }),
  ]);

  const now = new Date();
  // CTE가 정한 순서를 유지한다.
  const items = propertyIds.map((propertyId) => {
    const property = properties.find((row) => row.id === propertyId);
    const myOwnerships = ownerships.filter((ownership) => ownership.propertyId === propertyId);
    return toPropertyResponse(property, resolveMyRelation({ role: user.role, ownerships: myOwnerships, now }));
  });
  return { items, meta: toPageMeta(page, size, total) };
};

const findTenantProperties = async (user, page, size) => {
  const { propertyIds, total } = await pagePropertyIds(tenantCte(user.id), page, size);

  const [properties, contracts] = await Promise.all([
    prisma.property.findMany({ where: { id: { in: propertyIds } }, include: { complex: true } }),
    prisma.contract.findMany({
      where: { tenantId: user.id, ownership: { propertyId: { in: propertyIds } } },
      select: { id: true, ownership: { select: { propertyId: true } } },
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
    }),
  ]);

  const items = propertyIds.map((propertyId) => {
    const property = properties.find((row) => row.id === propertyId);
    const contractIds = contracts
      .filter((contract) => contract.ownership.propertyId === propertyId)
      .map((contract) => contract.id);
    return toPropertyResponse(property, { type: 'TENANT', ownershipId: null, verificationStatus: null, contractIds });
  });
  return { items, meta: toPageMeta(page, size, total) };
};

export const findMyProperties = async (user, { relation, page, size }) => {
  if (relation === 'FORMER_OWNER') return findFormerOwnerProperties(user, page, size);
  if (relation === 'TENANT') return findTenantProperties(user, page, size);
  return findOwnerProperties(user, page, size);
};

// 없거나 관계가 없으면 null → controller가 404 PROPERTY_NOT_FOUND.
export const findPropertyForUser = async (user, propertyId) => {
  const property = await prisma.property.findUnique({ where: { id: propertyId }, include: { complex: true } });
  if (!property) return null;

  const myRelation = await loadMyRelation(user, propertyId);
  if (!myRelation) return null;

  return toPropertyResponse(property, myRelation);
};

// PATCH /properties/:propertyId — ADMIN 또는 이 호실의 "계산된" VERIFIED 활성 소유자만.
// 만료된 인증(저장값 VERIFIED, 계산값 EXPIRED)은 수정할 수 없다.
export const updateProperty = async (user, propertyId, data) => {
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
  const relation = property ? await loadMyRelation(user, propertyId) : null;
  if (!relation) throw new AppError('PROPERTY_NOT_FOUND', 404, '호실을 찾을 수 없습니다.');

  if (user.role !== 'ADMIN') {
    if (relation.type !== 'OWNER' || relation.verificationStatus !== 'VERIFIED') {
      throw new AppError('OWNERSHIP_VERIFICATION_REQUIRED', 403, '권리자 인증을 마친 소유자만 수정할 수 있습니다.');
    }
  }

  const updated = await prisma.property.update({ where: { id: propertyId }, data, include: { complex: true } });
  return toPropertyResponse(updated, relation);
};
