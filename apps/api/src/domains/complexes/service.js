import { AppError } from '../../platform/AppError.js';
import { toDateOnlyString } from '../../platform/dateUtils.js';
import { prisma } from '../../platform/prismaClient.js';
import { attachAliases, chooseOwnerComplexId, findKeyOwners } from './complexAliases.js';
import { chooseSearchIdentity } from './complexMatching.js';
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
  // 별칭으로 붙은 키(같은 건물의 KAPT·PNU 키)도 같은 단지로 본다.
  const keys = items.flatMap((item) => [item.sourceKey, ...(item.linkedKeys ?? [])]);
  const owners = await findKeyOwners(prisma, [...new Set(keys)]);
  const ownerByKey = new Map(owners.map((owner) => [owner.sourceKey, owner.complexId]));

  const seen = new Set();
  const results = [];
  for (const item of items) {
    const identity = chooseSearchIdentity(item, ownerByKey);
    if (identity.split) {
      console.warn('[complexes] alias_split', { keys: item.linkedKeys, complexId: identity.complexId });
    }
    // 별칭 규칙으로 키가 바뀌어 앞 항목과 같아지면 하나만 둔다.
    if (seen.has(identity.sourceKey)) continue;
    seen.add(identity.sourceKey);
    results.push({
      sourceKey: identity.sourceKey,
      complexId: identity.complexId,
      name: item.name,
      jibunAddress: item.jibunAddress ?? null,
      roadAddress: item.roadAddress ?? null,
      legalDongCode: item.legalDongCode,
    });
  }
  return results;
};

// 같은 건물의 다른 키(KAPT ↔ PNU). 계산이 실패하면(외부 장애 포함) 입력 키만 쓴다 — 연결만 못 할 뿐 등록은 된다.
const getLinkedSourceKeys = async (sourceKey, external) => {
  try {
    return await callProvider((provider) => provider.getLinkedSourceKeys(sourceKey, external));
  } catch (error) {
    console.error('[complexes] linked keys failed', error.code ?? error.name);
    return [sourceKey];
  }
};

const findComplexWithRegion = (complexId) =>
  prisma.complex.findUnique({ where: { id: complexId }, include: COMPLEX_INCLUDE });

// 별칭(또는 별칭 행이 아직 없는 옛 complexes.source_key)으로 이미 있는 단지를 찾는다.
const findExistingComplex = async (sourceKey) => {
  const alias = await prisma.complexSourceAlias.findUnique({ where: { sourceKey }, select: { complexId: true } });
  if (alias) return findComplexWithRegion(alias.complexId);

  const legacy = await prisma.complex.findUnique({ where: { sourceKey }, include: COMPLEX_INCLUDE });
  if (legacy) await attachAliases(prisma, legacy.id, [sourceKey]);
  return legacy;
};

const toComplexData = async (sourceKey, external) => {
  // regions는 읍면동 단위만 있어서 리 단위 코드는 올려서 저장한다.
  const legalDongCode = rollUpLegalDongCode(external.legalDongCode);
  const region = await prisma.region.findUnique({ where: { legalDongCode }, select: { legalDongCode: true } });
  if (!region) {
    // 법정동 전체 시드 이후에는 생기지 않아야 한다. 응답은 일반 500으로 둔다.
    console.error('[complexes] region missing', legalDongCode);
    throw new Error('region missing');
  }

  const buildingInfo = external.buildingInfo ?? {};
  return {
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
};

const resolveComplexOnce = async (sourceKey) => {
  // 1) 이미 있는 단지는 외부 호출 없이 돌려준다.
  const existing = await findExistingComplex(sourceKey);
  if (existing) return existing;

  const external = await callProvider((provider) => provider.getComplexBySourceKey(sourceKey));
  if (!external) {
    throw new AppError('COMPLEX_SOURCE_NOT_FOUND', 404, '단지 정보를 찾을 수 없습니다.');
  }

  // 2) 같은 건물의 다른 키가 이미 어느 단지에 붙어 있으면 그 단지에 이 키를 더한다.
  //    여러 단지에 걸쳐 있으면 KAPT 별칭을 가진 단지를 고르고, 다른 단지에 붙은 키는 옮기지 않는다.
  const linkedKeys = await getLinkedSourceKeys(sourceKey, external);
  const owners = await findKeyOwners(prisma, linkedKeys);
  const ownerId = chooseOwnerComplexId(owners);
  if (ownerId) {
    const complexIds = [...new Set(owners.map((owner) => owner.complexId))];
    if (complexIds.length > 1) console.warn('[complexes] alias_conflict', { keys: linkedKeys, complexIds });
    await attachAliases(prisma, ownerId, linkedKeys);
    return findComplexWithRegion(ownerId);
  }

  // 3) 새로 만든다. 단지와 같은 건물의 키 전부를 한 트랜잭션으로 넣는다.
  //    동시에 같은 건물을 resolve하면 한쪽이 유니크 충돌(P2002)로 롤백된다 — 호출한 쪽이 다시 시도한다.
  const data = await toComplexData(sourceKey, external);
  return prisma.$transaction(async (tx) => {
    const complex = await tx.complex.create({ data, include: COMPLEX_INCLUDE });
    await tx.complexSourceAlias.createMany({
      data: [...new Set(linkedKeys)].map((key) => ({ sourceKey: key, complexId: complex.id })),
    });
    return complex;
  });
};

export const resolveComplex = async (sourceKey) => {
  try {
    return toComplexResponse(await resolveComplexOnce(sourceKey));
  } catch (error) {
    // 경쟁에서 진 쪽: 이제 상대가 만든 별칭이 보이므로 한 번 더 하면 그 단지를 돌려준다.
    if (error.code !== 'P2002') throw error;
    return toComplexResponse(await resolveComplexOnce(sourceKey));
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
