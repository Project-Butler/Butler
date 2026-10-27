// 공식 연계(JUSO_LINK) 하루치 계획·적용. 날짜 = 연계 기준일(= 건물DB 일변동분 stdde + 1).
// 하루치 = 세 자료요청 구분(100004 동 표시·100001 도로명주소 한글·100005 도로명)의 파일. 재반영 파일은 같은 날짜 뒤에 붙여
// 줄 순서대로 적용한다(같은 건물이면 뒤의 줄이 이긴다). 적용은 건물DB 일변동분과 같은 엔진(applyCursorImport)이다.
// 계획(planJusoLinkDay)은 쓰기가 없어서 shadow 비교도 같은 함수를 쓴다.
import { spendApiCall } from '../domains/complexes/apiUsage.js';
import { rollUpLegalDongCode } from '../domains/complexes/provider/pnu.js';
import { jusoReferenceSearch } from '../domains/complexes/provider/publicProvider.js';
import { toRoadNameKey } from '../domains/complexes/kaptAddress.js';
import { applyCursorImport, countDeleteTargets } from './jusoDelta.js';
import { collapseDeltaOps, splitDeltaLines } from './jusoDeltaApplier.js';
import {
  evaluateLinkGate,
  indexRoadAddresses,
  parseDongLine,
  parseRoadNameLine,
  pickSearchedBuilding,
  pickSearchTargets,
  planLinkLine,
  summarizeUnresolved,
} from './jusoLinkAdapter.js';
import { compositeLinkHash, LINK_CODES, readLinkZipTables } from './jusoLinkResponse.js';
import { applyRoadRenames } from './jusoLinks.js';
import { loadKaptLookup } from './kaptLookup.js';
import { SOURCES } from './referenceImports.js';

// 검색 대체 조회: 실행(하루치)당 최대 횟수·한 번 제한 시간, 하루 상한(external_api_usage)
export const LINK_SEARCH_MAX_CALLS = 3;
export const LINK_SEARCH_TIMEOUT_MS = 2000;
export const LINK_SEARCH_API = 'juso-reference-search';
export const LINK_SEARCH_DAILY_LIMIT = 300;

// 통계에 남길 unresolved 목록 길이
const MAX_LISTED = 50;

const TABLE_NAMES = ['TH_RNSPBD_DONG', 'TH_SGCO_RNADR_MST', 'TH_SGCO_RNADR_LNBR', 'TI_SPRD_RDNM'];

// 날짜 하나의 파일들({ [cntcCode]: [파일…] }, 일반 → 재반영 순) → { tables: { 표 이름: 줄[] }, fileSize, fileSha1 }
export const readJusoLinkDay = async (day) => {
  const tables = Object.fromEntries(TABLE_NAMES.map((name) => [name, []]));
  const zips = [];
  for (const code of [LINK_CODES.BUILDING_DONG, LINK_CODES.ROAD_ADDRESS, LINK_CODES.ROAD_NAME]) {
    for (const file of day[code] ?? []) {
      if (!file.zip) continue;
      zips.push(file.zip);
      for (const [name, text] of Object.entries(await readLinkZipTables(file.zip))) {
        (tables[name] ??= []).push(...splitDeltaLines(text));
      }
    }
  }
  return {
    tables,
    fileSize: BigInt(zips.reduce((sum, zip) => sum + zip.length, 0)),
    fileSha1: compositeLinkHash(zips),
  };
};

// 100005 → 도로명 변경 목록. 사용 중(0)이고 변경이력사유가 0(도로명 변경)인 줄만. 같은 도로명코드는 뒤의 줄.
export const toRoadRenames = (lines) => {
  const map = new Map();
  for (const line of lines) {
    const row = parseRoadNameLine(line);
    if (!row || !row.inUse || row.changeReason !== '0' || !row.roadName) continue;
    const roadNameKey = toRoadNameKey(row.roadName);
    if (roadNameKey) map.set(row.roadCode, { roadCode: row.roadCode, roadName: row.roadName, roadNameKey });
  }
  return [...map.values()];
};

// 기본 검색: 하루 상한을 넘지 않을 때만 부르고, 제한 시간이 지나면 포기한다(실패해도 던지지 않음 → 모름).
const defaultSearch = async (prisma, keyword) => {
  if ((await spendApiCall(prisma, LINK_SEARCH_API, LINK_SEARCH_DAILY_LIMIT)) === null) return [];
  let timer;
  try {
    return await Promise.race([
      jusoReferenceSearch.searchJuso(keyword),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve([]), LINK_SEARCH_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
};

// 동 표시 줄에 나온 건물·도로명코드·법정동만 DB에서 읽어 맥락을 만든다.
const loadLinkContext = async (prisma, dongLines, renames) => {
  const dongs = dongLines.map(parseDongLine).filter(Boolean);
  const buildingMgtNos = [...new Set(dongs.map((dong) => dong.buildingMgtNo))];
  const roadCodes = [...new Set(dongs.map((dong) => dong.roadCode))];
  const rolledCodes = [...new Set(dongs.map((dong) => rollUpLegalDongCode(dong.legalDongCode)))];

  const existingRows = buildingMgtNos.length
    ? await prisma.$queryRaw`
        SELECT building_mgt_no AS "buildingMgtNo", road_sigungu_cd AS "roadSigunguCd", road_name_key AS "roadNameKey",
               road_underground AS "roadUnderground", road_main_no AS "roadMainNo", road_sub_no AS "roadSubNo",
               road_code AS "roadCode", kapt_code AS "kaptCode", match_rule AS "matchRule"
        FROM juso_building_links WHERE building_mgt_no = ANY(${buildingMgtNos}::varchar[])`
    : [];
  const roadKeys = roadCodes.length
    ? await prisma.$queryRaw`
        SELECT DISTINCT ON (road_code) road_code AS "roadCode", road_name_key AS "roadNameKey"
        FROM juso_building_links WHERE road_code = ANY(${roadCodes}::varchar[]) ORDER BY road_code, updated_at DESC`
    : [];
  const regionRows = rolledCodes.length
    ? await prisma.region.findMany({
        where: { legalDongCode: { in: rolledCodes } },
        select: { legalDongCode: true, sidoName: true, sigunguName: true, dongName: true },
      })
    : [];
  const kaptCodes = [...new Set(existingRows.map((row) => row.kaptCode))];
  const inactive = kaptCodes.length
    ? await prisma.kaptComplex.findMany({ where: { kaptCode: { in: kaptCodes }, isActive: false }, select: { kaptCode: true } })
    : [];

  const roadKeyByCode = new Map(roadKeys.map((row) => [row.roadCode, row.roadNameKey]));
  // 이번 날짜의 도로명 변경은 쓰기 전에 계획에도 반영한다(변경은 묶음보다 먼저 적용된다).
  for (const rename of renames) roadKeyByCode.set(rename.roadCode, rename.roadNameKey);

  const lookup = await loadKaptLookup(prisma, {
    sigunguCodes: [...new Set(dongs.map((dong) => dong.legalDongCode.slice(0, 5)))],
    legalDongCodes: [...new Set(dongs.flatMap((dong) => [dong.legalDongCode, dong.buildingMgtNo.slice(0, 10)]))],
  });

  return {
    lookup,
    ctx: {
      roadKeyByCode,
      regions: new Map(regionRows.map((row) => [row.legalDongCode, row])),
      existing: new Map(existingRows.map((row) => [row.buildingMgtNo, row])),
      inactiveKaptCodes: new Set(inactive.map((row) => row.kaptCode)),
      searched: new Map(),
    },
  };
};

// 하루치 계획(쓰기 없음). search(keyword) → juso 행 배열. searchLimit 0이면 검색하지 않는다.
// 결과: { ops, renames, rowsRead, planned(통계), gate }
// deadlineAt: 검색 대체 조회는 마감까지 한 번 제한 시간보다 많이 남았을 때만 부른다(계획이 마감을 넘기지 않게).
export const planJusoLinkDay = async ({ prisma, tables, search = null, searchLimit = LINK_SEARCH_MAX_CALLS, deadlineAt = Infinity }) => {
  const dongLines = tables.TH_RNSPBD_DONG ?? [];
  const renames = toRoadRenames(tables.TI_SPRD_RDNM ?? []);
  const { lookup, ctx } = await loadLinkContext(prisma, dongLines, renames);
  ctx.roadAddresses = indexRoadAddresses(tables.TH_SGCO_RNADR_MST ?? []);

  // 같은 검색어(같은 필지의 여러 동)는 한 번만 부른다. searched = 실제 호출 수
  const results = new Map();
  for (const target of pickSearchTargets(dongLines, ctx, lookup, searchLimit)) {
    if (!results.has(target.keyword)) {
      if (deadlineAt - Date.now() < LINK_SEARCH_TIMEOUT_MS * 2) break;
      results.set(target.keyword, (await (search ?? ((keyword) => defaultSearch(prisma, keyword)))(target.keyword)) ?? []);
    }
    const found = pickSearchedBuilding(results.get(target.keyword), target);
    if (found) ctx.searched.set(target.buildingMgtNo, found);
  }
  const searched = results.size;

  const ops = dongLines.map((line) => planLinkLine(line, lookup, ctx));
  const { upserts, deletes } = collapseDeltaOps(ops);
  const { existing, total } = await countDeleteTargets(prisma, deletes);
  const { considered, unresolved, ignored } = summarizeUnresolved(ops);
  const codes = {};
  for (const op of ops) {
    const code = op.row?.changeReasonCode ?? op.code ?? 'invalid';
    codes[code] = (codes[code] ?? 0) + 1;
  }
  return {
    ops,
    renames,
    rowsRead: dongLines.length,
    gate: evaluateLinkGate({ tables, ops, existingDeleteCount: existing, totalLinks: total }),
    planned: {
      upserts: upserts.length,
      deletes: deletes.length,
      existingDeletes: existing,
      codes,
      renames: renames.length,
      searched,
      found: ctx.searched.size,
      considered,
      unresolvedCount: unresolved.length,
      unresolved: unresolved.slice(0, MAX_LISTED),
      ignoredUnresolved: ignored,
    },
  };
};

// 하루치 적용. linkDate 'YYYY-MM-DD'. tables·fileSize·fileSha1은 readJusoLinkDay 결과.
// 나머지 인자(deadlineAt·batchSize·allowGap·keySet·now·clock)는 applyCursorImport와 같다.
export const applyJusoLinkDay = async ({ prisma, linkDate, tables, fileSize, fileSha1, fileName = null, search = null, ...options }) => {
  let renames = [];
  return applyCursorImport({
    prisma,
    source: SOURCES.JUSO_LINK,
    fileDate: linkDate,
    fileName: fileName ?? `juso-link ${linkDate}`,
    fileSize,
    fileSha1,
    noBaselineReason: 'no baseline (run juso-link:cutover first)',
    prepare: async () => {
      const plan = await planJusoLinkDay({ prisma, tables, search, deadlineAt: options.deadlineAt ?? Infinity });
      renames = plan.renames;
      return plan;
    },
    beforeBatches: (tx) => applyRoadRenames(tx, renames, options.keySet ?? null),
    ...options,
  });
};
