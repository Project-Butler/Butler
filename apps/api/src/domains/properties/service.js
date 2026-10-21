import { Prisma } from '@prisma/client';
import { ACTIVITY_TYPES, recordActivity } from '../../platform/activityLog.js';
import { AppError } from '../../platform/AppError.js';
import { getTodayKST } from '../../platform/dateUtils.js';
import { compareUnits } from '../../platform/naturalSort.js';
import { computeOwnershipVerificationStatus } from '../../platform/ownershipStatus.js';
import { prisma } from '../../platform/prismaClient.js';
import { resolveMyRelation, toOwnershipResponse, toPropertySummary } from '../../platform/propertySerializer.js';
import { computePropertyStatus } from '../../platform/propertyStatus.js';
import { LISTING_FIELDS, toListing } from '../../platform/unitListing.js';
import { countActiveUnitsInComplex, lockLandlordBuilding } from '../landlordBuildings/unitCounts.js';

// 호실 상태 계산(computePropertyStatus)에 필요한 계약 칸.
const CONTRACT_SELECT = { select: { id: true, startDate: true, endDate: true, terminatedOn: true } };

const MAX_BUILDING_NAME_LENGTH = 50; // LandlordBuilding.name VarChar(50)

// 명세 Property 응답 + status·myListing(명세 변경 C7).
// myListing은 내 활성 소유 관계가 있을 때만(임차인·이전 소유자·ADMIN은 null).
const toPropertyResponse = (property, myRelation, { status, myListing }) => ({
  ...toPropertySummary(property),
  myRelation,
  status,
  myListing,
  createdAt: property.createdAt.toISOString(),
});

// 관계(myRelation)·상태·myListing을 한 번에 만든다. 관계가 없으면 null(호출하는 쪽이 404).
// - ownerships: 요청자의 이 호실 소유 관계 전부(contracts include)
// - tenantContracts: 요청자가 임차인인 이 호실 계약
const buildPropertyView = ({ user, property, ownerships = [], tenantContracts = [], now, today }) => {
  const myRelation = resolveMyRelation({ role: user.role, ownerships, tenantContracts, now });
  if (!myRelation) return null;

  const relationOwnership = ownerships.find((ownership) => ownership.id === myRelation.ownershipId) ?? null;
  const contracts = myRelation.type === 'TENANT' ? tenantContracts : relationOwnership?.contracts ?? [];
  return toPropertyResponse(property, myRelation, {
    status: computePropertyStatus(contracts, today),
    myListing: myRelation.type === 'OWNER' && relationOwnership ? toListing(relationOwnership) : null,
  });
};

const toPageMeta = (page, size, total) => ({ page, size, total, hasNext: page * size < total });

// 요청자와 이 호실의 관계를 계산하는 데 필요한 행만 읽는다.
// 다른 사람의 소유 관계는 조회하지 않는다 — 어떤 응답에도 드러나지 않아야 한다(api-contract.md 3장).
const loadRelationRows = async (user, propertyId) => {
  const [ownerships, tenantContracts] = await Promise.all([
    prisma.propertyOwnership.findMany({
      where: { propertyId, userId: user.id },
      include: { contracts: CONTRACT_SELECT },
    }),
    prisma.contract.findMany({
      where: { tenantId: user.id, ownership: { propertyId } },
      ...CONTRACT_SELECT,
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
    }),
  ]);
  return { ownerships, tenantContracts };
};

const throwOwnershipAlreadyExists = () => {
  throw new AppError('OWNERSHIP_ALREADY_EXISTS', 409, '이미 등록한 부동산입니다.');
};

const isUniqueViolation = (error) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

// 그 단지에 내 건물 설정이 없으면 기본값(이름 = 단지 이름, 정원 없음)으로 만든다(명세 변경 C5).
// 숨긴(삭제한) 설정이 있으면 이름을 그대로 두고 되살린다. 동시에 같은 단지로 등록해도 행은 하나다.
// 새로 만들었거나 되살렸으면 true.
const ensureLandlordBuilding = async (tx, user, complex) => {
  const name = complex.name.slice(0, MAX_BUILDING_NAME_LENGTH);
  const inserted = await tx.$queryRaw`
    INSERT INTO landlord_buildings (id, user_id, complex_id, name, created_at, updated_at)
    VALUES (gen_random_uuid(), ${user.id}::uuid, ${complex.id}::uuid, ${name}, now(), now())
    ON CONFLICT (user_id, complex_id) DO UPDATE SET deleted_at = NULL, updated_at = now()
      WHERE landlord_buildings.deleted_at IS NOT NULL
    RETURNING id`;
  return inserted.length > 0;
};

// 방 구성·설비가 요청에 없으면 같은 호실에서 내가 가장 최근에 끝낸 소유 관계의 값을 이어받는다.
const resolveListing = async (tx, user, propertyId, listing) => {
  const missing = LISTING_FIELDS.filter((field) => listing[field] === undefined);
  if (missing.length === 0) return listing;

  const previous = await tx.propertyOwnership.findFirst({
    where: { propertyId, userId: user.id, endedAt: { not: null } },
    orderBy: [{ endedAt: 'desc' }, { id: 'asc' }],
    select: { unitType: true, equipment: true, equipmentEtc: true },
  });
  const inherited = previous ? toListing(previous) : toListing({});
  // null(값 비우기)을 보낸 칸은 이어받지 않는다.
  return Object.fromEntries(
    LISTING_FIELDS.map((field) => [field, listing[field] !== undefined ? listing[field] : inherited[field]]),
  );
};

// POST /properties — 한 트랜잭션: 건물 설정 보장 → 설정 행 잠금 → 호실 upsert(빈 면적·층만 채움)
// → 같은 호실 내 활성 소유 관계 확인 → 정원 검사 → 내 UNVERIFIED 소유 관계 생성 → 활동 기록.
// 같은 임대인의 동시 등록은 설정 행 잠금(FOR UPDATE)으로 줄을 서서 정원을 넘지 않는다.
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

        stage = 'landlordBuilding';
        let buildingCreated = await ensureLandlordBuilding(tx, user, complex);
        let building = await lockLandlordBuilding(tx, { userId: user.id, complexId: complex.id });
        if (!building) {
          // 만든 직후 다른 요청(DELETE /landlord-buildings)이 지웠으면 한 번 더 만들고 잠근다.
          buildingCreated = (await ensureLandlordBuilding(tx, user, complex)) || buildingCreated;
          building = await lockLandlordBuilding(tx, { userId: user.id, complexId: complex.id });
          if (!building) throw new AppError('LANDLORD_BUILDING_NOT_FOUND', 404, '건물 설정을 찾을 수 없습니다. 다시 시도해 주세요.');
        }
        if (buildingCreated) {
          await recordActivity(tx, {
            userId: user.id,
            type: ACTIVITY_TYPES.LANDLORD_BUILDING_CREATED,
            complexId: complex.id,
            params: { buildingName: building.name, auto: true },
          });
        }

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

        if (building.capacity !== null) {
          const propertyCount = await countActiveUnitsInComplex(tx, user.id, complex.id);
          if (propertyCount >= building.capacity) {
            throw new AppError(
              'LANDLORD_BUILDING_CAPACITY_EXCEEDED',
              409,
              `전체 호실 수(${building.capacity}개)를 넘어 등록할 수 없습니다. 건물의 전체 호실 수를 먼저 늘려 주세요.`,
            );
          }
        }

        const listing = await resolveListing(tx, user, upserted.id, input.listing);

        stage = 'ownershipCreate';
        const created = await tx.propertyOwnership.create({
          data: {
            propertyId: upserted.id,
            userId: user.id,
            acquiredYearMonth: input.acquiredYearMonth,
            purchasePrice: input.purchasePrice,
            verificationStatus: 'UNVERIFIED',
            ...listing,
          },
        });

        await recordActivity(tx, {
          userId: user.id,
          type: ACTIVITY_TYPES.PROPERTY_REGISTERED,
          complexId: complex.id,
          propertyId: upserted.id,
          params: { buildingName: building.name, buildingNo: filled.buildingNo, unitNo: filled.unitNo },
        });

        return { property: filled, ownership: created };
      });

      // TODO(audit): OWNERSHIP_CREATED — audit.record()가 생기면 여기서 기록한다.
      const now = new Date();
      const summary = toPropertySummary(property);
      return {
        property: toPropertyResponse(
          property,
          {
            type: 'OWNER',
            ownershipId: ownership.id,
            verificationStatus: computeOwnershipVerificationStatus(ownership, now),
            contractIds: [],
          },
          { status: computePropertyStatus([], getTodayKST()), myListing: toListing(ownership) },
        ),
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

// relation=OWNER — 내 활성 소유 관계 전부를 (단지, 동, 호) 자연 정렬한 뒤 한 페이지.
// 자연 정렬은 DB가 못 하므로 JS에서 한다(임대인 한 명의 활성 호실 수 규모라 전부 읽어도 된다).
const findOwnerProperties = async (user, { page, size, complexId }) => {
  const ownerships = await prisma.propertyOwnership.findMany({
    where: { userId: user.id, endedAt: null, ...(complexId ? { property: { complexId } } : {}) },
    include: { property: { include: { complex: true } }, contracts: CONTRACT_SELECT },
  });

  const now = new Date();
  const today = getTodayKST();
  const sorted = [...ownerships].sort((a, b) => compareUnits(a.property, b.property));
  const items = sorted
    .slice((page - 1) * size, page * size)
    .map((ownership) => buildPropertyView({ user, property: ownership.property, ownerships: [ownership], now, today }));
  return { items, meta: toPageMeta(page, size, ownerships.length) };
};

// complexId 필터(명세 변경 C8)를 CTE에 넣는 조각
const complexFilter = (complexId) =>
  complexId
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM properties p WHERE p.id = o.property_id AND p.complex_id = ${complexId}::uuid)`
    : Prisma.empty;

// relation=FORMER_OWNER — 지금은 소유하지 않는 호실마다 가장 최근에 끝난 내 소유 관계 1개.
// 호실별 1행을 고르는 DISTINCT ON은 Prisma 쿼리로 표현할 수 없어서 $queryRaw를 쓴다.
const formerOwnerCte = (userId, complexId) => Prisma.sql`
  WITH latest AS (
    SELECT DISTINCT ON (o.property_id) o.property_id, o.id AS ownership_id, o.ended_at AS relation_at
    FROM property_ownerships o
    WHERE o.user_id = ${userId}::uuid
      AND o.ended_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM property_ownerships a
        WHERE a.property_id = o.property_id AND a.user_id = ${userId}::uuid AND a.ended_at IS NULL
      )
      ${complexFilter(complexId)}
    ORDER BY o.property_id, o.ended_at DESC
  )`;

// relation=TENANT — 내가 임차인인 계약이 있는 호실마다 가장 최근에 시작한 계약 1개.
const tenantCte = (userId, complexId) => Prisma.sql`
  WITH latest AS (
    SELECT DISTINCT ON (o.property_id) o.property_id, c.start_date AS relation_at
    FROM contracts c
    JOIN property_ownerships o ON o.id = c.ownership_id
    WHERE c.tenant_id = ${userId}::uuid
      ${complexFilter(complexId)}
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

const findFormerOwnerProperties = async (user, { page, size, complexId }) => {
  const { propertyIds, total } = await pagePropertyIds(formerOwnerCte(user.id, complexId), page, size);

  const [properties, ownerships] = await Promise.all([
    prisma.property.findMany({ where: { id: { in: propertyIds } }, include: { complex: true } }),
    prisma.propertyOwnership.findMany({
      where: { userId: user.id, propertyId: { in: propertyIds } },
      include: { contracts: CONTRACT_SELECT },
    }),
  ]);

  const now = new Date();
  const today = getTodayKST();
  // CTE가 정한 순서를 유지한다.
  const items = propertyIds.map((propertyId) => {
    const property = properties.find((row) => row.id === propertyId);
    const myOwnerships = ownerships.filter((ownership) => ownership.propertyId === propertyId);
    return buildPropertyView({ user, property, ownerships: myOwnerships, now, today });
  });
  return { items, meta: toPageMeta(page, size, total) };
};

const findTenantProperties = async (user, { page, size, complexId }) => {
  const { propertyIds, total } = await pagePropertyIds(tenantCte(user.id, complexId), page, size);

  const [properties, contracts] = await Promise.all([
    prisma.property.findMany({ where: { id: { in: propertyIds } }, include: { complex: true } }),
    prisma.contract.findMany({
      where: { tenantId: user.id, ownership: { propertyId: { in: propertyIds } } },
      select: { ...CONTRACT_SELECT.select, ownership: { select: { propertyId: true } } },
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
    }),
  ]);

  const today = getTodayKST();
  const items = propertyIds.map((propertyId) => {
    const property = properties.find((row) => row.id === propertyId);
    const tenantContracts = contracts.filter((contract) => contract.ownership.propertyId === propertyId);
    return toPropertyResponse(
      property,
      { type: 'TENANT', ownershipId: null, verificationStatus: null, contractIds: tenantContracts.map((contract) => contract.id) },
      { status: computePropertyStatus(tenantContracts, today), myListing: null },
    );
  });
  return { items, meta: toPageMeta(page, size, total) };
};

export const findMyProperties = async (user, { relation, ...query }) => {
  if (relation === 'FORMER_OWNER') return findFormerOwnerProperties(user, query);
  if (relation === 'TENANT') return findTenantProperties(user, query);
  return findOwnerProperties(user, query);
};

// 없거나 관계가 없으면 null → controller가 404 PROPERTY_NOT_FOUND.
export const findPropertyForUser = async (user, propertyId) => {
  const property = await prisma.property.findUnique({ where: { id: propertyId }, include: { complex: true } });
  if (!property) return null;

  const rows = await loadRelationRows(user, propertyId);
  return buildPropertyView({ user, property, ...rows, now: new Date(), today: getTodayKST() });
};

// PATCH /properties/:propertyId — ADMIN 또는 이 호실의 "계산된" VERIFIED 활성 소유자만.
// 만료된 인증(저장값 VERIFIED, 계산값 EXPIRED)은 수정할 수 없다.
export const updateProperty = async (user, propertyId, data) => {
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
  const rows = property ? await loadRelationRows(user, propertyId) : null;
  const relation = rows ? resolveMyRelation({ role: user.role, ...rows }) : null;
  if (!relation) throw new AppError('PROPERTY_NOT_FOUND', 404, '호실을 찾을 수 없습니다.');

  if (user.role !== 'ADMIN') {
    if (relation.type !== 'OWNER' || relation.verificationStatus !== 'VERIFIED') {
      throw new AppError('OWNERSHIP_VERIFICATION_REQUIRED', 403, '권리자 인증을 마친 소유자만 수정할 수 있습니다.');
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.property.update({ where: { id: propertyId }, data, include: { complex: true } });
    await recordActivity(tx, {
      userId: user.id,
      type: ACTIVITY_TYPES.PROPERTY_UPDATED,
      complexId: row.complexId,
      propertyId,
      params: { buildingNo: row.buildingNo, unitNo: row.unitNo, fields: Object.keys(data) },
    });
    return row;
  });
  return buildPropertyView({ user, property: updated, ...rows, now: new Date(), today: getTodayKST() });
};
