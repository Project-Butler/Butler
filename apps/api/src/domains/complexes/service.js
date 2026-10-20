import { AppError } from '../../platform/AppError.js';
import { toDateOnlyString } from '../../platform/dateUtils.js';
import { prisma } from '../../platform/prismaClient.js';
import { toRoadNameKey } from './kaptAddress.js';
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

// resolve가 읽는 검색 저장본 기간(검색 뒤 이 시간 안에 고른 주소만 새 단지로 만든다)
const SEARCH_RESULT_TTL_MS = 24 * 60 * 60 * 1000;

const SOURCE_NOT_FOUND_MESSAGE = '단지 정보를 찾을 수 없습니다. 주소를 다시 검색해 주세요.';

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

// 아직 단지가 없는 검색 결과만 저장한다. 같은 키는 1시간에 한 번만 덮어쓴다(같은 검색을 여러 번 해도 쓰기가 늘지 않음).
const saveSearchResults = async (items) => {
  if (items.length === 0) return;
  const keys = items.map((item) => item.sourceKey);
  const payloads = items.map((item) => JSON.stringify(item.payload));
  await prisma.$executeRaw`
    INSERT INTO address_search_results (source_key, payload, fetched_at)
    SELECT key, payload::jsonb, now()
    FROM unnest(${keys}::text[], ${payloads}::text[]) AS t(key, payload)
    ON CONFLICT (source_key) DO UPDATE
      SET payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at
      WHERE address_search_results.fetched_at < now() - interval '1 hour'`;
};

export const searchComplexes = async ({ query, size }) => {
  const items = await callProvider((provider) => provider.searchComplexes(query, size));
  if (items.length === 0) return [];

  // 이미 플랫폼에 등록된 단지면 complexId를 채운다(없으면 null → 프론트가 resolve).
  const existing = await prisma.complex.findMany({
    where: { sourceKey: { in: items.map((item) => item.sourceKey) } },
    select: { id: true, sourceKey: true },
  });
  const complexIdByKey = new Map(existing.map((complex) => [complex.sourceKey, complex.id]));

  // 저장본 쓰기가 실패해도 검색은 성공으로 응답한다(resolve가 404 "다시 검색"을 낸다).
  try {
    await saveSearchResults(items.filter((item) => !complexIdByKey.has(item.sourceKey)));
  } catch (error) {
    console.error('[complexes] search result save failed', error.code ?? error.name);
  }

  return items.map((item) => ({
    sourceKey: item.sourceKey,
    complexId: complexIdByKey.get(item.sourceKey) ?? null,
    name: item.name,
    jibunAddress: item.jibunAddress ?? null,
    roadAddress: item.roadAddress ?? null,
    legalDongCode: item.legalDongCode,
  }));
};

const trimOrNull = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
};

const toIntOrNull = (value) => {
  const number = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isInteger(number) ? number : null;
};

// juso detBdNmList('101동,102동, 103동') → ['101동', '102동', '103동'](공백 제거, 중복 제거)
const toDetailBuildingNames = (value) => [
  ...new Set(
    String(value ?? '')
      .split(',')
      .map((name) => name.replace(/\s+/g, ''))
      .filter(Boolean),
  ),
];

// 검색 저장본(juso 칸) → complexes 행
const toComplexData = (sourceKey, payload, legalDongCode) => {
  const roadAddress = trimOrNull(payload.roadAddr);
  const roadName = trimOrNull(payload.rn);
  return {
    sourceKey,
    name: trimOrNull(payload.bdNm) ?? roadAddress ?? sourceKey,
    jibunAddress: trimOrNull(payload.jibunAddr),
    roadAddress,
    legalDongCode,
    zipCode: trimOrNull(payload.zipNo),
    officialBuildingName: trimOrNull(payload.bdNm),
    detailBuildingNames: toDetailBuildingNames(payload.detBdNmList),
    roadCode: trimOrNull(payload.rnMgtSn),
    isUnderground: String(payload.udrtYn) === '1',
    buildingMainNo: toIntOrNull(payload.buldMnnm),
    buildingSubNo: toIntOrNull(payload.buldSlno),
    sigunguCode: String(payload.admCd ?? '').slice(0, 5) || null,
    roadName,
    roadNameKey: roadName ? toRoadNameKey(roadName) : null,
    isMountain: String(payload.mtYn) === '1',
    mainLot: toIntOrNull(payload.lnbrMnnm),
    subLot: toIntOrNull(payload.lnbrSlno),
    buildingMgtNo: trimOrNull(payload.bdMgtSn),
  };
};

const findComplexBySourceKey = (sourceKey) =>
  prisma.complex.findUnique({ where: { sourceKey }, include: COMPLEX_INCLUDE });

const throwSourceNotFound = () => {
  throw new AppError('COMPLEX_SOURCE_NOT_FOUND', 404, SOURCE_NOT_FOUND_MESSAGE);
};

// 외부 호출 없음: 이미 있는 단지는 그대로, 없으면 24시간 안의 검색 저장본으로 만든다.
const resolveComplexOnce = async (sourceKey) => {
  const existing = await findComplexBySourceKey(sourceKey);
  if (existing) return existing;

  const saved = await prisma.addressSearchResult.findUnique({ where: { sourceKey } });
  if (!saved || saved.fetchedAt.getTime() < Date.now() - SEARCH_RESULT_TTL_MS) throwSourceNotFound();

  // regions는 읍면동 단위만 있어서 리 단위 코드는 올려서 저장한다.
  const legalDongCode = rollUpLegalDongCode(saved.payload.admCd);
  const region = legalDongCode
    ? await prisma.region.findUnique({ where: { legalDongCode }, select: { legalDongCode: true } })
    : null;
  if (!region) {
    console.error('[complexes] region missing', legalDongCode);
    throwSourceNotFound();
  }

  return prisma.complex.create({ data: toComplexData(sourceKey, saved.payload, legalDongCode), include: COMPLEX_INCLUDE });
};

export const resolveComplex = async (sourceKey) => {
  try {
    return toComplexResponse(await resolveComplexOnce(sourceKey));
  } catch (error) {
    // 동시에 같은 키를 resolve해 경쟁에서 진 쪽: 이제 상대가 만든 단지가 보이므로 한 번 더 하면 그 단지를 돌려준다.
    if (error.code !== 'P2002') throw error;
    return toComplexResponse(await resolveComplexOnce(sourceKey));
  }
};

export const findComplexById = async (complexId) => {
  const complex = await prisma.complex.findUnique({ where: { id: complexId }, include: COMPLEX_INCLUDE });
  return complex ? toComplexResponse(complex) : null;
};
