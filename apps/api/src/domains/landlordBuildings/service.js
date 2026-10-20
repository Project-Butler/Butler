// 임대인 건물 설정(임대인 × 단지: 건물명·정원·메모). 본인 것만 다루고, 남의 것은 404로 숨긴다.
import { Prisma } from '@prisma/client';
import { ACTIVITY_TYPES, recordActivity } from '../../platform/activityLog.js';
import { AppError } from '../../platform/AppError.js';
import { prisma } from '../../platform/prismaClient.js';
import {
  countActiveUnitsByComplex,
  countActiveUnitsInComplex,
  lockLandlordBuilding,
  toRemainingCount,
} from './unitCounts.js';

// 이번 PR에서는 항상 등록중. 운영 시작은 계약(#4)과 함께.
export const LANDLORD_BUILDING_STATUS = 'SETUP';

const COMPLEX_SELECT = { select: { id: true, name: true, roadAddress: true, legalDongCode: true } };

export const toLandlordBuildingResponse = (building, propertyCount) => ({
  id: building.id,
  complex: {
    id: building.complex.id,
    name: building.complex.name,
    roadAddress: building.complex.roadAddress ?? null,
    legalDongCode: building.complex.legalDongCode,
  },
  name: building.name,
  capacity: building.capacity ?? null,
  memo: building.memo ?? null,
  propertyCount,
  remainingCount: toRemainingCount(building.capacity, propertyCount),
  status: LANDLORD_BUILDING_STATUS,
  createdAt: building.createdAt.toISOString(),
  updatedAt: building.updatedAt.toISOString(),
});

const throwNotFound = () => {
  throw new AppError('LANDLORD_BUILDING_NOT_FOUND', 404, '건물을 찾을 수 없습니다.');
};

const throwCapacityBelowUnits = (propertyCount) => {
  throw new AppError(
    'LANDLORD_BUILDING_CAPACITY_BELOW_UNITS',
    422,
    `이미 등록한 호실(${propertyCount}개)보다 적게 정할 수 없습니다.`,
  );
};

const isUniqueViolation = (error) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const withCount = async (building) =>
  toLandlordBuildingResponse(building, await countActiveUnitsInComplex(prisma, building.userId, building.complexId));

// POST /landlord-buildings
// P2002(@@unique userId+complexId)는 트랜잭션 밖에서 409로 바꾼다(실패한 트랜잭션 안에서는 다시 조회할 수 없음).
export const createLandlordBuilding = async (user, input) => {
  try {
    const created = await prisma.$transaction(async (tx) => {
      const complex = await tx.complex.findUnique({ where: { id: input.complexId }, select: { id: true } });
      if (!complex) throw new AppError('COMPLEX_NOT_FOUND', 404, '단지를 찾을 수 없습니다.');

      // 건물 설정을 지웠다가 다시 만들 때 이미 등록한 호실이 남아 있을 수 있다.
      if (input.capacity != null) {
        const propertyCount = await countActiveUnitsInComplex(tx, user.id, input.complexId);
        if (propertyCount > input.capacity) throwCapacityBelowUnits(propertyCount);
      }

      const building = await tx.landlordBuilding.create({
        data: { userId: user.id, ...input },
        include: { complex: COMPLEX_SELECT },
      });
      await recordActivity(tx, {
        userId: user.id,
        type: ACTIVITY_TYPES.LANDLORD_BUILDING_CREATED,
        complexId: building.complexId,
        params: { buildingName: building.name },
      });
      return building;
    });
    return withCount(created);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('LANDLORD_BUILDING_ALREADY_EXISTS', 409, '이 주소에는 이미 건물을 등록했습니다.');
    }
    throw error;
  }
};

const toPageMeta = (page, size, total) => ({ page, size, total, hasNext: page * size < total });

// GET /landlord-buildings — 본인 것, 만든 순서대로. 등록 수는 그룹 집계 1번.
export const findMyLandlordBuildings = async (user, { page, size }) => {
  const where = { userId: user.id };
  const [buildings, total] = await prisma.$transaction([
    prisma.landlordBuilding.findMany({
      where,
      include: { complex: COMPLEX_SELECT },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.landlordBuilding.count({ where }),
  ]);

  const counts = await countActiveUnitsByComplex(
    prisma,
    user.id,
    buildings.map((building) => building.complexId),
  );
  return {
    items: buildings.map((building) => toLandlordBuildingResponse(building, counts.get(building.complexId) ?? 0)),
    meta: toPageMeta(page, size, total),
  };
};

// 본인 또는 ADMIN(조회만). 그 밖은 null → controller가 404.
export const findLandlordBuildingForUser = async (user, landlordBuildingId) => {
  const building = await prisma.landlordBuilding.findUnique({
    where: { id: landlordBuildingId },
    include: { complex: COMPLEX_SELECT },
  });
  if (!building) return null;
  if (building.userId !== user.id && user.role !== 'ADMIN') return null;
  return withCount(building);
};

// PATCH — 설정 행을 잠근 뒤 등록 수를 세어 새 정원과 비교한다(같은 임대인의 동시 호실 등록과 줄을 섬).
export const updateLandlordBuilding = async (user, landlordBuildingId, data) => {
  const updated = await prisma.$transaction(async (tx) => {
    const locked = await lockLandlordBuilding(tx, { id: landlordBuildingId, userId: user.id });
    if (!locked) throwNotFound();

    if (data.capacity != null) {
      const propertyCount = await countActiveUnitsInComplex(tx, user.id, locked.complexId);
      if (propertyCount > data.capacity) throwCapacityBelowUnits(propertyCount);
    }

    const building = await tx.landlordBuilding.update({
      where: { id: landlordBuildingId },
      data,
      include: { complex: COMPLEX_SELECT },
    });
    await recordActivity(tx, {
      userId: user.id,
      type: ACTIVITY_TYPES.LANDLORD_BUILDING_UPDATED,
      complexId: building.complexId,
      params: { buildingName: building.name, fields: Object.keys(data) },
    });
    return building;
  });
  return withCount(updated);
};

// DELETE — 그 단지에 내 활성 소유 관계가 있으면 409(호실을 먼저 정리).
export const deleteLandlordBuilding = async (user, landlordBuildingId) => {
  await prisma.$transaction(async (tx) => {
    const locked = await lockLandlordBuilding(tx, { id: landlordBuildingId, userId: user.id });
    if (!locked) throwNotFound();

    const propertyCount = await countActiveUnitsInComplex(tx, user.id, locked.complexId);
    if (propertyCount > 0) {
      throw new AppError(
        'LANDLORD_BUILDING_HAS_PROPERTIES',
        409,
        '등록한 호실이 있어 건물을 삭제할 수 없습니다. 호실을 먼저 정리해 주세요.',
      );
    }

    await tx.landlordBuilding.delete({ where: { id: landlordBuildingId } });
    await recordActivity(tx, {
      userId: user.id,
      type: ACTIVITY_TYPES.LANDLORD_BUILDING_DELETED,
      complexId: locked.complexId,
      params: { buildingName: locked.name },
    });
  });
};
