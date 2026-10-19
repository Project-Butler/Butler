import { AppError } from '../../platform/AppError.js';
import { toDateOnlyString } from '../../platform/dateUtils.js';
import { prisma } from '../../platform/prismaClient.js';
import { callProvider } from './provider/index.js';
import { rollUpLegalDongCode } from './provider/pnu.js';

const REGION_SELECT = {
  legalDongCode: true,
  sidoName: true,
  sigunguName: true,
  dongName: true,
  fullName: true,
};

const COMPLEX_INCLUDE = { region: { select: REGION_SELECT } };

// buildingInfo 다섯 값이 모두 null이면 buildingInfo 자체를 null로 내려준다(api-contract.md 2장).
const toBuildingInfo = (complex) => {
  const buildingInfo = {
    approvalDate: toDateOnlyString(complex.approvalDate),
    householdCount: complex.householdCount,
    buildingCount: complex.buildingCount,
    maxFloor: complex.maxFloor,
    parkingCount: complex.parkingCount,
  };
  return Object.values(buildingInfo).every((value) => value === null) ? null : buildingInfo;
};

// resolve·상세 공통 응답. createdByAdmin·updatedAt은 내려주지 않는다.
// complex는 region을 include한 Prisma Complex여야 한다.
const toComplexResponse = (complex) => ({
  id: complex.id,
  sourceKey: complex.sourceKey,
  name: complex.name,
  legalDongCode: complex.legalDongCode,
  roadAddress: complex.roadAddress,
  jibunAddress: complex.jibunAddress,
  region: {
    legalDongCode: complex.region.legalDongCode,
    sidoName: complex.region.sidoName,
    sigunguName: complex.region.sigunguName,
    dongName: complex.region.dongName,
    fullName: complex.region.fullName,
  },
  buildingInfo: toBuildingInfo(complex),
  createdAt: complex.createdAt.toISOString(),
});

// 'YYYY-MM-DD' → Prisma @db.Date 컬럼에 넣을 UTC 자정 Date
const toDateColumn = (dateString) => (dateString ? new Date(`${dateString}T00:00:00Z`) : null);

export const searchComplexes = async ({ query, size }) => {
  const items = await callProvider((provider) => provider.searchComplexes(query, size));
  if (items.length === 0) return [];

  // 이미 플랫폼에 등록된 단지면 complexId를 채운다(없으면 null → 프론트가 resolve).
  const registered = await prisma.complex.findMany({
    where: { sourceKey: { in: items.map((item) => item.sourceKey) } },
    select: { id: true, sourceKey: true },
  });
  const idBySourceKey = new Map(registered.map((complex) => [complex.sourceKey, complex.id]));

  return items.map((item) => ({
    sourceKey: item.sourceKey,
    complexId: idBySourceKey.get(item.sourceKey) ?? null,
    name: item.name,
    jibunAddress: item.jibunAddress ?? null,
    roadAddress: item.roadAddress ?? null,
    legalDongCode: item.legalDongCode,
  }));
};

export const resolveComplex = async (sourceKey) => {
  // 이미 있는 단지는 외부 호출 없이 돌려준다.
  const existing = await prisma.complex.findUnique({ where: { sourceKey }, include: COMPLEX_INCLUDE });
  if (existing) return toComplexResponse(existing);

  const external = await callProvider((provider) => provider.getComplexBySourceKey(sourceKey));
  if (!external) {
    throw new AppError('COMPLEX_SOURCE_NOT_FOUND', 404, '단지 정보를 찾을 수 없습니다.');
  }

  // regions는 읍면동 단위만 있어서 리 단위 코드는 올려서 저장한다.
  const legalDongCode = rollUpLegalDongCode(external.legalDongCode);
  const region = await prisma.region.findUnique({ where: { legalDongCode }, select: { legalDongCode: true } });
  if (!region) {
    // 법정동 전체 시드 이후에는 생기지 않아야 한다. 응답은 일반 500으로 둔다.
    console.error('[complexes] region missing', legalDongCode);
    throw new Error('region missing');
  }

  const buildingInfo = external.buildingInfo ?? {};
  const data = {
    sourceKey,
    name: external.name,
    jibunAddress: external.jibunAddress ?? null,
    roadAddress: external.roadAddress ?? null,
    legalDongCode,
    approvalDate: toDateColumn(buildingInfo.approvalDate),
    householdCount: buildingInfo.householdCount ?? null,
    buildingCount: buildingInfo.buildingCount ?? null,
    maxFloor: buildingInfo.maxFloor ?? null,
    parkingCount: buildingInfo.parkingCount ?? null,
  };

  try {
    const complex = await prisma.complex.upsert({
      where: { sourceKey },
      create: data,
      update: {},
      include: COMPLEX_INCLUDE,
    });
    return toComplexResponse(complex);
  } catch (error) {
    // 같은 sourceKey를 동시에 resolve하면 한쪽 upsert가 유니크 충돌(P2002)로 실패한다.
    // 먼저 만든 행을 다시 읽어 같은 단지를 돌려준다.
    if (error.code !== 'P2002') throw error;
    const created = await prisma.complex.findUnique({ where: { sourceKey }, include: COMPLEX_INCLUDE });
    if (!created) throw error;
    return toComplexResponse(created);
  }
};

export const findComplexById = async (complexId) => {
  const complex = await prisma.complex.findUnique({ where: { id: complexId }, include: COMPLEX_INCLUDE });
  return complex ? toComplexResponse(complex) : null;
};

export const findUnitInfo = async ({ complexId, buildingNo, unitNo }) => {
  const complex = await prisma.complex.findUnique({
    where: { id: complexId },
    select: { id: true, sourceKey: true, name: true, jibunAddress: true, roadAddress: true, legalDongCode: true },
  });
  if (!complex) {
    throw new AppError('COMPLEX_NOT_FOUND', 404, '단지를 찾을 수 없습니다.');
  }

  const unitInfo = await callProvider((provider) => provider.getUnitInfo({ complex, buildingNo, unitNo }));
  if (!unitInfo || (unitInfo.exclusiveArea == null && unitInfo.floor == null)) {
    throw new AppError('UNIT_INFO_NOT_FOUND', 404, '동·호 정보를 찾지 못했습니다. 직접 입력해 주세요.');
  }

  return { exclusiveArea: unitInfo.exclusiveArea ?? null, floor: unitInfo.floor ?? null };
};
