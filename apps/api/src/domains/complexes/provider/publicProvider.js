// 공공데이터 provider — 검색은 행안부 도로명주소(juso), 단지 식별·기본정보는 K-apt(공동주택),
// K-apt에 없는 단지와 동·호 면적은 건축HUB(건축물대장).
//
// sourceKey: K-apt 단지와 이름이 맞으면 `KAPT:<kaptCode>`, 아니면 `PNU:<19자리>`(pnu.js).
//
// 보안: 호스트·경로는 아래 상수로만 정한다(SSRF 방지). 사용자 입력은 URLSearchParams 값으로만
// 들어간다. data.go.kr 키는 Decoding 키라 URLSearchParams가 한 번만 인코딩한다.
// 실패는 ExternalServiceError(reason)로만 던진다 — reason에 URL·키·응답 원문을 넣지 않는다.
// 공통 호출 도구(fetchJson 등)는 publicApi.js.
import { prisma } from '../../../platform/prismaClient.js';
import { KAPT_BASIS_API, KAPT_BASIS_LIVE_LIMIT, spendApiCall } from '../apiUsage.js';
import {
  isFlagOn,
  linkJusoRowsToKapt,
  mergeSearchGroups,
  toJusoLotKey,
  toJusoRoadKey,
  toLotKeyString,
  toRoadKeyString,
} from '../complexMatching.js';
import { parseJibunLot } from '../kaptAddress.js';
import { fetchKaptBasis, saveKaptBasis } from '../kaptBasis.js';
import { ExternalServiceError } from './ExternalServiceError.js';
import { buildPnu, parsePnu, rollUpLegalDongCode, toBuildingRegisterParams } from './pnu.js';
import { fetchJson, readDataGoKrBody, toItemArray } from './publicApi.js';

const JUSO_BASE_URL = 'https://business.juso.go.kr/addrlink/addrLinkApi.do';
const KAPT_LIST_URL = 'https://apis.data.go.kr/1613000/AptListService4/getLegaldongAptList4';
const BUILDING_HUB_BASE_URL = 'https://apis.data.go.kr/1613000/BldRgstHubService';
const BUILDING_HUB_RECAP_URL = `${BUILDING_HUB_BASE_URL}/getBrRecapTitleInfo`; // 총괄표제부
const BUILDING_HUB_TITLE_URL = `${BUILDING_HUB_BASE_URL}/getBrTitleInfo`; // 표제부
const BUILDING_HUB_EXPOS_URL = `${BUILDING_HUB_BASE_URL}/getBrExposPubuseAreaInfo`; // 전유공용면적

const MAX_JUSO_ROWS = 50;
const MAX_LEGAL_DONGS_PER_SEARCH = 5;
const KAPT_LIST_PAGE_SIZE = 100;
const KAPT_LIST_MAX_PAGES = 5;
const BUILDING_HUB_PAGE_SIZE = 100;
// 동·호 정보 후보를 차례로 부를 때 새 호출을 시작하지 않는 시점(ms). 진행 중인 호출은 타임아웃까지 기다린다.
const UNIT_INFO_DEADLINE_MS = 15000;
const UNIT_INFO_ATTEMPTS = 2;
const UNIT_INFO_RETRY_DELAY_MS = 700;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 검색어 문제(빈 값·한 글자·숫자만·특수문자·SQL 예약어 등)는 오류가 아니라 결과 없음으로 본다.
// 그 밖의 코드(E0001 미승인 키, E0014 키 만료, -999 시스템 오류 등)는 503.
const JUSO_EMPTY_RESULT_CODES = ['E0005', 'E0006', 'E0008', 'E0009', 'E0010', 'E0011', 'E0012', 'E0013', 'E0015'];
const JUSO_APARTMENT_KIND = '1'; // bdKdcd: 1 공동주택

const toPositiveInt = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number);
};

// 'YYYYMMDD' → 'YYYY-MM-DD'. 형식이 틀리면 null.
const toDateString = (value) => {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const [, yyyy, mm, dd] = match;
  return `${yyyy}-${mm}-${dd}`;
};

const trimOrNull = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
};

// ---------------------------------------------------------------- juso

const searchJuso = async (keyword, countPerPage) => {
  // juso 금지 특수문자(% = > < [ ])는 호출하는 쪽(controller)에서 걷어낸다. 직접 호출할 때도 같은 값을 넘겨야 한다.
  const cleaned = String(keyword).trim();
  if (cleaned.length === 0) return [];

  const json = await fetchJson('juso', JUSO_BASE_URL, {
    confmKey: process.env.JUSO_API_KEY,
    keyword: cleaned,
    currentPage: '1',
    countPerPage: String(countPerPage),
    resultType: 'json',
  });

  const errorCode = json?.results?.common?.errorCode;
  if (errorCode === '0') return json.results.juso ?? [];
  if (JUSO_EMPTY_RESULT_CODES.includes(errorCode)) return [];
  throw new ExternalServiceError(`juso errorCode ${errorCode ?? 'missing'}`);
};

const toJusoPnu = (juso) => buildPnu(juso.admCd, juso.mtYn, juso.lnbrMnnm, juso.lnbrSlno);

// ---------------------------------------------------------------- K-apt

const fetchKaptList = async (bjdCode) => {
  const complexes = [];
  for (let pageNo = 1; pageNo <= KAPT_LIST_MAX_PAGES; pageNo += 1) {
    const json = await fetchJson('kapt-list', KAPT_LIST_URL, {
      serviceKey: process.env.DATA_GO_KR_SERVICE_KEY,
      bjdCode,
      pageNo: String(pageNo),
      numOfRows: String(KAPT_LIST_PAGE_SIZE),
    });
    const body = readDataGoKrBody('kapt-list', json);
    const items = toItemArray(body?.items);
    complexes.push(...items);

    const totalCount = Number(body?.totalCount) || 0;
    if (items.length === 0 || complexes.length >= totalCount) break;
  }
  return complexes;
};

// 리 단위 admCd는 K-apt에 그대로 없을 수 있어서, 비어 있으면 읍면동으로 올린 코드로 한 번 더 찾는다.
// cache는 요청 하나 안에서만 쓴다(같은 법정동을 두 번 부르지 않도록).
// kapt_complexes 테이블이 아직 비어 있을 때(동기화 전 새 환경)만 쓰는 대체 경로다.
const getKaptListForAdmCd = (admCd, cache) => {
  if (!cache.has(admCd)) {
    cache.set(
      admCd,
      (async () => {
        const list = await fetchKaptList(admCd);
        const rolledUp = rollUpLegalDongCode(admCd);
        if (list.length > 0 || rolledUp === admCd) return list;
        return fetchKaptList(rolledUp);
      })(),
    );
  }
  return cache.get(admCd);
};

const fetchKaptListsFromApi = async (admCds) => {
  const cache = new Map();
  return new Map(await Promise.all(admCds.map(async (admCd) => [admCd, await getKaptListForAdmCd(admCd, cache)])));
};

// 단지 목록 캐시(kapt_complexes)에 활성 행이 있는지. 한 번 있으면 프로세스가 끝날 때까지 다시 보지 않는다.
// 비어 있으면 다음 검색에서 다시 확인한다 — 첫 동기화 직후부터 바로 테이블을 쓰도록.
let isKaptCacheFilled = false;
let hasWarnedEmptyKaptCache = false;

const isKaptCacheReady = async () => {
  if (isKaptCacheFilled) return true;
  const row = await prisma.kaptComplex.findFirst({ where: { isActive: true }, select: { kaptCode: true } });
  isKaptCacheFilled = Boolean(row);
  if (!isKaptCacheFilled && !hasWarnedEmptyKaptCache) {
    hasWarnedEmptyKaptCache = true;
    console.warn('[complexes] kapt_complexes가 비어 있음 — 동기화(npm run sync:kapt) 전까지 K-apt 목록 API를 직접 부릅니다');
  }
  return isKaptCacheFilled;
};

// admCd마다 admCd와 읍면동으로 올린 코드의 활성 단지를 쿼리 한 번으로 읽는다.
// 반환 모양은 외부 목록 API와 같은 { kaptCode, kaptName } 배열이다(matchKaptComplex 입력).
const findKaptListsFromDb = async (admCds) => {
  const codesByAdmCd = new Map(admCds.map((admCd) => [admCd, [admCd, rollUpLegalDongCode(admCd)]]));
  const rows = await prisma.kaptComplex.findMany({
    where: { isActive: true, legalDongCode: { in: [...new Set([...codesByAdmCd.values()].flat())] } },
    select: { kaptCode: true, name: true, legalDongCode: true },
    orderBy: { kaptCode: 'asc' },
  });

  return new Map(
    admCds.map((admCd) => {
      const codes = codesByAdmCd.get(admCd);
      const list = rows
        .filter((row) => codes.includes(row.legalDongCode))
        .map((row) => ({ kaptCode: row.kaptCode, kaptName: row.name }));
      return [admCd, list];
    }),
  );
};

const getKaptLists = async (admCds) => {
  if (admCds.length === 0) return new Map();
  return (await isKaptCacheReady()) ? findKaptListsFromDb(admCds) : fetchKaptListsFromApi(admCds);
};

// 이름 비교용: 공백·'아파트'·'단지'를 빼고 소문자로. juso '파크리오' ↔ K-apt '잠실파크리오'처럼
// 한쪽이 다른 쪽을 포함하면 같은 단지로 본다. 완전히 같은 이름이 있으면 그쪽을 먼저 고른다.
const normalizeComplexName = (name) =>
  String(name ?? '')
    .replace(/\s+/g, '')
    .replace(/아파트|단지/g, '')
    .toLowerCase();

const MIN_PARTIAL_MATCH_LENGTH = 3;

const matchKaptComplex = (buildingName, kaptList) => {
  const target = normalizeComplexName(buildingName);
  if (target.length === 0) return null;

  let best = null;
  let bestGap = Infinity;
  for (const kapt of kaptList) {
    const candidate = normalizeComplexName(kapt.kaptName);
    if (candidate.length === 0) continue;
    if (candidate === target) return kapt;
    // 짧은 이름이 엉뚱한 단지에 부분 일치하지 않도록 포함 비교는 양쪽 3자 이상일 때만 한다.
    if (Math.min(candidate.length, target.length) < MIN_PARTIAL_MATCH_LENGTH) continue;
    if (candidate.includes(target) || target.includes(candidate)) {
      const gap = Math.abs(candidate.length - target.length);
      if (gap < bestGap) {
        best = kapt;
        bestGap = gap;
      }
    }
  }
  return best;
};

// 단지 이름으로 kapt_complexes를 직접 찾는다. 도로명주소(juso)는 건물명이 K-apt와 다르거나('SKYVILLE' ↔ '스카이빌')
// 아예 검색되지 않는 단지가 있어서, 이름 검색을 함께 해야 K-apt 단지를 놓치지 않는다.
// 검색어 전체가 단지명(공백 제거)에 들어 있거나, 여러 단어면 가장 긴 단어가 단지명에 있고
// 나머지 단어가 단지명이나 지역명(시도·시군구·읍면동·리)에 모두 들어 있는 단지를 고른다.
const MAX_NAME_CANDIDATES = 300;

const toKaptRegionText = (row) =>
  [row.sidoName, row.sigunguName, row.dongName, row.riName].filter(Boolean).join(' ');

const findKaptByName = async (query, size) => {
  const compact = normalizeComplexName(query);
  const tokens = String(query)
    .split(/\s+/)
    .map(normalizeComplexName)
    .filter((token) => token.length >= 2);
  if (compact.length < 2 || tokens.length === 0) return [];

  const longest = tokens.reduce((a, b) => (b.length > a.length ? b : a));
  const rows = await prisma.$queryRaw`
    SELECT kapt_code AS "kaptCode", name, legal_dong_code AS "legalDongCode",
           sido_name AS "sidoName", sigungu_name AS "sigunguName", dong_name AS "dongName", ri_name AS "riName"
    FROM kapt_complexes
    WHERE is_active
      AND (lower(regexp_replace(name, '\\s|아파트|단지', '', 'g')) LIKE ${`%${compact}%`}
        OR lower(regexp_replace(name, '\\s|아파트|단지', '', 'g')) LIKE ${`%${longest}%`})
    LIMIT ${MAX_NAME_CANDIDATES}`;

  const ranked = [];
  for (const row of rows) {
    const name = normalizeComplexName(row.name);
    const haystack = name + normalizeComplexName(toKaptRegionText(row));
    let rank = null;
    if (name === compact) rank = 0;
    else if (name.includes(compact)) rank = 1;
    else if (tokens.every((token) => haystack.includes(token))) rank = 2;
    if (rank !== null) ranked.push({ row, rank, gap: Math.abs(name.length - compact.length) });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.gap - b.gap || a.row.kaptCode.localeCompare(b.row.kaptCode));
  return ranked.slice(0, size).map(({ row, rank }) => ({ row, isExact: rank === 0 }));
};

const toKaptNameResult = (row) => ({
  sourceKey: `KAPT:${row.kaptCode}`,
  name: row.name,
  // 단지 목록에는 번지·도로명이 없어서 지역명만 둔다. 정확한 주소는 resolve가 K-apt 기본정보로 채운다.
  jibunAddress: trimOrNull(toKaptRegionText(row)),
  roadAddress: null,
  legalDongCode: rollUpLegalDongCode(row.legalDongCode),
});

// ---------------------------------------------------------------- 건축HUB

const fetchBuildingHub = async (label, url, params) => {
  const json = await fetchJson(label, url, {
    serviceKey: process.env.DATA_GO_KR_SERVICE_KEY,
    ...params,
    numOfRows: String(BUILDING_HUB_PAGE_SIZE),
    pageNo: '1',
    _type: 'json',
  });
  const body = readDataGoKrBody(label, json);
  return toItemArray(body?.items);
};

const toRecapBuildingInfo = (recap) => ({
  approvalDate: toDateString(recap.useAprDay),
  householdCount: toPositiveInt(recap.hhldCnt),
  buildingCount: toPositiveInt(recap.mainBldCnt),
  // 총괄표제부에는 최고층이 없다.
  maxFloor: null,
  parkingCount: toPositiveInt(recap.totPkngCnt),
});

// 총괄표제부가 없는 필지(단일 동 등)는 표제부(동별) 행을 합친다.
const toTitleBuildingInfo = (titles) => {
  const approvalDates = titles.map((title) => toDateString(title.useAprDay)).filter(Boolean).sort();
  const householdTotal = titles.reduce((sum, title) => sum + (toPositiveInt(title.hhldCnt) ?? 0), 0);
  const maxFloor = titles.reduce((max, title) => Math.max(max, toPositiveInt(title.grndFlrCnt) ?? 0), 0);

  return {
    approvalDate: approvalDates[0] ?? null,
    householdCount: householdTotal > 0 ? householdTotal : null,
    buildingCount: titles.length > 0 ? titles.length : null,
    maxFloor: maxFloor > 0 ? maxFloor : null,
    parkingCount: null,
  };
};

// ---------------------------------------------------------------- provider 함수

// 도로명 구조 키·법정동(리)+본번으로 kapt_complexes를 한 번씩 읽는다(기본정보가 채워진 단지만 나온다).
// 결과: { kaptCodesByRoadKey, kaptCodesByLotKey, nameByCode }
const findKaptLinkCandidates = async (apartments) => {
  const roadKeys = new Map();
  const lotKeys = new Map();
  for (const juso of apartments) {
    const roadKey = toJusoRoadKey(juso);
    if (roadKey) roadKeys.set(toRoadKeyString(roadKey), roadKey);
    const lotKey = toJusoLotKey(juso);
    if (lotKey) lotKeys.set(toLotKeyString(lotKey), lotKey);
  }
  const select = {
    kaptCode: true,
    name: true,
    legalDongCode: true,
    mainLot: true,
    roadSigunguCd: true,
    roadNameKey: true,
    roadUnderground: true,
    roadMainNo: true,
    roadSubNo: true,
  };
  const [roadRows, lotRows] = await Promise.all([
    roadKeys.size > 0
      ? prisma.kaptComplex.findMany({ where: { isActive: true, OR: [...roadKeys.values()] }, select })
      : [],
    lotKeys.size > 0
      ? prisma.kaptComplex.findMany({ where: { isActive: true, OR: [...lotKeys.values()] }, select })
      : [],
  ]);

  const group = (rows, toKey) => {
    const map = new Map();
    for (const row of rows) {
      const key = toKey(row);
      map.set(key, [...(map.get(key) ?? []), row.kaptCode]);
    }
    return map;
  };
  return {
    kaptCodesByRoadKey: group(roadRows, toRoadKeyString),
    kaptCodesByLotKey: group(lotRows, (row) => toLotKeyString({ legalDongCode: row.legalDongCode, mainLot: row.mainLot })),
    nameByCode: new Map([...roadRows, ...lotRows].map((row) => [row.kaptCode, row.name])),
  };
};

const isRoadMatchOn = () => isFlagOn(process.env.COMPLEX_ROAD_MATCH);

const searchComplexes = async (query, size) => {
  const [jusoRows, nameMatches] = await Promise.all([
    searchJuso(query, Math.min(size * 2, MAX_JUSO_ROWS)),
    (async () => ((await isKaptCacheReady()) ? findKaptByName(query, size) : []))(),
  ]);
  const apartments = jusoRows.filter((juso) => juso.bdKdcd === JUSO_APARTMENT_KIND && trimOrNull(juso.bdNm));

  const admCds = [...new Set(apartments.map((juso) => juso.admCd))].slice(0, MAX_LEGAL_DONGS_PER_SEARCH);
  // 법정동 5개를 넘는 결과는 K-apt를 조회하지 않았으므로 버린다.
  const [kaptLists, linkCandidates] = await Promise.all([
    getKaptLists(admCds),
    isRoadMatchOn() && (await isKaptCacheReady()) ? findKaptLinkCandidates(apartments) : null,
  ]);
  const usable = apartments.filter((juso) => kaptLists.has(juso.admCd));
  const links = linkCandidates ? linkJusoRowsToKapt(usable, linkCandidates) : usable.map(() => null);

  const linkedItems = [];
  const jusoItems = [];
  usable.forEach((juso, index) => {
    const link = links[index];
    const pnu = toJusoPnu(juso);
    // 도로명·형제 건물·본번으로 연결 → 이름 비교 → 애매하거나 못 찾으면 PNU
    const kapt = link?.kaptCode
      ? { kaptCode: link.kaptCode, kaptName: linkCandidates.nameByCode.get(link.kaptCode) }
      : link?.ambiguous
        ? null
        : matchKaptComplex(juso.bdNm, kaptLists.get(juso.admCd));
    let sourceKey = null;
    if (kapt) sourceKey = `KAPT:${kapt.kaptCode}`;
    else if (pnu) sourceKey = `PNU:${pnu}`;
    if (!sourceKey) return;

    const item = {
      sourceKey,
      name: kapt?.kaptName ?? juso.bdNm.trim(),
      jibunAddress: trimOrNull(juso.jibunAddr),
      roadAddress: trimOrNull(juso.roadAddrPart1),
      legalDongCode: rollUpLegalDongCode(juso.admCd),
    };
    // 같은 건물의 KAPT·PNU 키(service가 별칭 소유 단지를 고를 때 쓴다, 응답에는 안 나감)
    if (linkCandidates && kapt && pnu) item.linkedKeys = [sourceKey, `PNU:${pnu}`];
    (link?.kaptCode ? linkedItems : jusoItems).push(item);
  });

  const toNameItems = (matches) => matches.map(({ row }) => ({ ...toKaptNameResult(row), fromName: true }));
  const exact = toNameItems(nameMatches.filter((match) => match.isExact));
  const partial = toNameItems(nameMatches.filter((match) => !match.isExact));
  // 도로명·형제·본번으로 연결된 결과 ≥ 단지명이 검색어와 똑같은 K-apt 단지 → 나머지 주소 검색 결과 → 부분 일치 단지명.
  // 같은 단지가 이름 검색과 주소 검색에 다 나오면 주소가 있는 주소 검색 쪽 값으로 둔다.
  const results = mergeSearchGroups([linkedItems, exact, jusoItems, partial], size);
  return results.map(({ fromName, ...item }) => item);
};

// 오늘 K-apt 기본정보 호출 한도를 다 쓴 경우: 단지 목록(kapt_complexes) 값만으로 만든다(buildingInfo 없음).
const getKaptComplexFromList = async (sourceKey, kaptCode) => {
  const row = await prisma.kaptComplex.findUnique({ where: { kaptCode } });
  if (!row) return null;
  console.warn('[complexes] kapt-basis daily limit reached — list fallback');
  return {
    sourceKey,
    name: row.name,
    jibunAddress: row.jibunAddress ?? trimOrNull(toKaptRegionText(row)),
    roadAddress: row.roadAddress,
    legalDongCode: rollUpLegalDongCode(row.legalDongCode),
    buildingInfo: null,
  };
};

const getKaptComplex = async (sourceKey, kaptCode) => {
  if ((await spendApiCall(prisma, KAPT_BASIS_API, KAPT_BASIS_LIVE_LIMIT)) === null) {
    return getKaptComplexFromList(sourceKey, kaptCode);
  }
  const basis = await fetchKaptBasis(kaptCode);
  if (!basis || !/^\d{10}$/.test(String(basis.bjdCode ?? ''))) return null;

  // 받은 기본정보로 kapt_complexes 주소 칸도 채운다(백필 1건 절약). 실패해도 resolve는 계속한다.
  try {
    await saveKaptBasis(prisma, kaptCode, basis);
  } catch (error) {
    console.error('[complexes] kapt basis save failed', error.code ?? error.name);
  }

  return {
    sourceKey,
    name: trimOrNull(basis.kaptName) ?? kaptCode,
    jibunAddress: trimOrNull(basis.kaptAddr),
    roadAddress: trimOrNull(basis.doroJuso),
    legalDongCode: rollUpLegalDongCode(basis.bjdCode),
    buildingInfo: {
      approvalDate: toDateString(basis.kaptUsedate),
      householdCount: toPositiveInt(basis.kaptdaCnt),
      buildingCount: toPositiveInt(basis.kaptDongCnt),
      maxFloor: toPositiveInt(basis.kaptTopFloor),
      // 기본정보 V5에는 주차대수가 확인되지 않았다. 필드가 오면 쓴다.
      parkingCount: toPositiveInt(basis.kaptdPcnt ?? basis.kaptdPcntu),
    },
  };
};

const getPnuComplex = async (sourceKey, pnu) => {
  const parsed = parsePnu(pnu);
  const params = toBuildingRegisterParams(pnu);
  if (!parsed || !params) return null;

  const recaps = await fetchBuildingHub('hub-recap', BUILDING_HUB_RECAP_URL, params);
  if (recaps.length > 0) {
    const [recap] = recaps;
    return {
      sourceKey,
      name: trimOrNull(recap.bldNm) ?? trimOrNull(recap.newPlatPlc) ?? trimOrNull(recap.platPlc),
      jibunAddress: trimOrNull(recap.platPlc),
      roadAddress: trimOrNull(recap.newPlatPlc),
      legalDongCode: rollUpLegalDongCode(parsed.admCd),
      buildingInfo: toRecapBuildingInfo(recap),
    };
  }

  const titles = await fetchBuildingHub('hub-title', BUILDING_HUB_TITLE_URL, params);
  if (titles.length === 0) return null;

  const named = titles.find((title) => trimOrNull(title.bldNm)) ?? titles[0];
  return {
    sourceKey,
    name: trimOrNull(named.bldNm) ?? trimOrNull(named.newPlatPlc) ?? trimOrNull(named.platPlc),
    jibunAddress: trimOrNull(named.platPlc),
    roadAddress: trimOrNull(named.newPlatPlc),
    legalDongCode: rollUpLegalDongCode(parsed.admCd),
    buildingInfo: toTitleBuildingInfo(titles),
  };
};

const getComplexBySourceKey = async (sourceKey) => {
  const [type, value] = String(sourceKey).split(':');
  let complex = null;
  if (type === 'KAPT' && value) complex = await getKaptComplex(sourceKey, value);
  if (type === 'PNU' && value) complex = await getPnuComplex(sourceKey, value);
  if (!complex || !complex.name) return null;
  return complex;
};

// '서울특별시 송파구 신천동 17 잠실파크리오' → '서울특별시 송파구 신천동 17' (뒤의 단지명 제거)
const stripComplexNameFromJibun = (jibunAddress) => {
  const match = /^(.*?\s(?:산\s?)?\d+(?:-\d+)?)(?=\s|$)/.exec(jibunAddress);
  return match ? match[1] : jibunAddress;
};

// '서울특별시 노원구 중계동 502-1 중계그린' → '서울특별시 노원구 중계동' (번지 앞 지역명)
const regionFromJibun = (jibunAddress) => {
  const match = /^(.*?)\s(?:산\s?)?\d+(?:-\d+)?(?=\s|$)/.exec(jibunAddress ?? '');
  return match ? match[1] : null;
};

// '114동', ' 114 동' → '114'
const toDongKey = (value) => String(value ?? '').replace(/\s+/g, '').replace(/동$/, '');

// 대단지는 동마다 필지(번지)가 다르다(예: 중계그린 101~105동은 502-1, 106~116동은 503, 117~125동은 504-1).
// juso는 건물마다 그 필지에 있는 동 목록(detBdNmList)을 주므로, 단지명으로 찾은 건물 중
// 입력한 동이 들어 있는 필지를 고른다. 같은 법정동·비슷한 이름의 건물만 본다.
const findPnuByBuilding = async (complex, buildingNo) => {
  const region = regionFromJibun(complex.jibunAddress);
  if (!region || !buildingNo) return null;

  const target = toDongKey(buildingNo);
  const complexName = normalizeComplexName(complex.name);
  const rows = await searchJuso(`${region} ${complex.name}`, 20);
  const juso = rows.find((row) => {
    if (row.bdKdcd !== JUSO_APARTMENT_KIND) return false;
    if (rollUpLegalDongCode(row.admCd) !== complex.legalDongCode) return false;
    const name = normalizeComplexName(row.bdNm);
    if (!name || !(name.includes(complexName) || complexName.includes(name))) return false;
    return String(row.detBdNmList ?? '')
      .split(',')
      .some((dong) => toDongKey(dong) === target);
  });
  return juso ? toJusoPnu(juso) : null;
};

// KAPT 키 단지는 PNU가 없어서 주소로 juso를 다시 찾아 필지를 얻는다. 롤업된 legalDongCode로는
// 리 지역 건축물대장을 못 찾기 때문에 juso의 admCd(리 단위)를 그대로 쓴다.
const findPnuByAddress = async (complex) => {
  const keywords = [complex.roadAddress, complex.jibunAddress && stripComplexNameFromJibun(complex.jibunAddress)]
    .map(trimOrNull)
    .filter(Boolean);

  for (const keyword of keywords) {
    const rows = await searchJuso(keyword, 5);
    const juso = rows.find((row) => row.bdKdcd === JUSO_APARTMENT_KIND) ?? rows[0];
    const pnu = juso ? toJusoPnu(juso) : null;
    if (pnu) return pnu;
  }
  return null;
};

// 입력한 동이 있는 필지를 먼저 찾고, 못 찾으면 단지 대표 주소의 필지를 쓴다.
const resolveComplexPnu = async (complex, buildingNo) => {
  const [type, value] = String(complex.sourceKey ?? '').split(':');
  const byBuilding = await findPnuByBuilding(complex, buildingNo);
  if (byBuilding) return byBuilding;
  if (type === 'PNU') return value;
  return findPnuByAddress(complex);
};

// 건축HUB 동 이름은 '101동' 형식이 대부분이라 그것부터, 없으면 입력값 그대로 찾는다.
const toDongNameCandidates = (buildingNo) => {
  const value = String(buildingNo);
  return value.endsWith('동') ? [value] : [`${value}동`, value];
};

const getUnitInfo = async ({ complex, buildingNo, unitNo }) => {
  const pnu = await resolveComplexPnu(complex, buildingNo);
  const params = pnu ? toBuildingRegisterParams(pnu) : null;
  if (!params) return null;

  // 호 이름도 단지마다 '1203'(파크리오)·'304호'(가평읍내주공)로 표기가 달라서 둘 다 찾아본다.
  const unitValue = String(unitNo).replace(/호$/, '');
  const candidates = toDongNameCandidates(buildingNo).flatMap((dongNm) =>
    [unitValue, `${unitValue}호`].map((hoNm) => ({ dongNm, hoNm })),
  );
  // 흔한 표기부터 하나씩 부르고 찾으면 멈춘다. 한꺼번에 부르면 건축HUB가 초당 한도로 429·503을 돌려주고
  // 하루 쿼터도 4배로 쓴다. 한 후보가 실패해도 다음 후보는 시도하고, 끝까지 못 찾았는데 실패가 있었으면
  // 그 실패(→ 503)를 낸다. 느린 응답이 이어져도 오래 붙잡지 않도록 전체 시간을 제한한다.
  const deadline = Date.now() + UNIT_INFO_DEADLINE_MS;
  let lastError = null;
  for (const { dongNm, hoNm } of candidates) {
    if (Date.now() > deadline) break;
    let rows = null;
    // 건축HUB는 정상 요청에도 가끔 429·503을 돌려줘서, 같은 후보를 잠깐 쉬었다가 한 번 더 부른다.
    for (let attempt = 1; attempt <= UNIT_INFO_ATTEMPTS && rows === null; attempt += 1) {
      try {
        rows = await fetchBuildingHub('hub-expos', BUILDING_HUB_EXPOS_URL, { ...params, dongNm, hoNm });
      } catch (error) {
        if (attempt < UNIT_INFO_ATTEMPTS && Date.now() + UNIT_INFO_RETRY_DELAY_MS < deadline) {
          await sleep(UNIT_INFO_RETRY_DELAY_MS);
        } else {
          // 다시 불러도 실패한 후보만 실패로 남긴다(재시도로 성공한 후보는 실패가 아니다).
          lastError = error;
          break;
        }
      }
    }
    if (rows === null) continue;
    const exclusiveRows = rows.filter(
      (row) => row.exposPubuseGbCdNm === '전유' && row.dongNm === dongNm && String(row.hoNm) === hoNm,
    );
    if (exclusiveRows.length === 0) continue;

    // 전유 부분이 여러 행으로 나뉜 호실도 있어서 면적은 합친다.
    const totalArea = exclusiveRows.reduce((sum, row) => sum + (Number(row.area) || 0), 0);
    const [first] = exclusiveRows;
    const floorNo = Number.parseInt(first.flrNo, 10);
    const isUnderground = first.flrGbCdNm === '지하' || first.flrGbCd === '10';

    return {
      exclusiveArea: totalArea > 0 ? Math.round(totalArea * 100) / 100 : null,
      floor: Number.isInteger(floorNo) ? (isUnderground ? -floorNo : floorNo) : null,
    };
  }
  if (lastError) throw lastError;
  return null;
};

// ---------------------------------------------------------------- 같은 건물의 다른 키(별칭)
// resolve가 새 단지를 만들 때 KAPT 키·PNU 키를 함께 별칭으로 붙여, 나중에 다른 키로 검색돼도 같은 Complex가 되게 한다.
// 확실할 때만 연결한다(후보가 정확히 하나). 못 찾으면 입력 키만 쓴다.

// KAPT 키 → K-apt 기본정보 지번(리 단위 법정동 코드 그대로 + 본번·부번)으로 PNU. 외부 호출 없음.
const findPnuKeyForKapt = async (kaptCode) => {
  const row = await prisma.kaptComplex.findUnique({
    where: { kaptCode },
    select: { legalDongCode: true, jibunAddress: true },
  });
  const lot = row ? parseJibunLot(row.jibunAddress) : null;
  if (!lot) return null;
  const pnu = buildPnu(row.legalDongCode, lot.isMountain ? '1' : '0', lot.mainLot, lot.subLot);
  return pnu ? `PNU:${pnu}` : null;
};


// PNU를 지번 검색어로: 단지 지번주소('… 신천동 17번지') 또는 법정동 이름 + 번지
const toPnuSearchKeyword = async (parsed, jibunAddress) => {
  const cleaned = trimOrNull(String(jibunAddress ?? '').replace(/번지/g, ' ').replace(/\s+/g, ' '));
  if (cleaned) return stripComplexNameFromJibun(cleaned);
  const region = await prisma.region.findUnique({
    where: { legalDongCode: rollUpLegalDongCode(parsed.admCd) },
    select: { fullName: true },
  });
  if (!region) return null;
  const sub = Number(parsed.subNo);
  return `${region.fullName} ${parsed.mtYn === '1' ? '산' : ''}${Number(parsed.mainNo)}${sub > 0 ? `-${sub}` : ''}`;
};

// PNU 키 → juso를 지번으로 찾아 구조 필드(admCd·산·본번·부번)가 PNU와 같은 아파트 행만 고르고,
// 그 행의 도로명 키로 K-apt 단지를 찾는다. 없으면 같은 법정동(리)·본번의 K-apt 단지가 하나뿐일 때 그 단지.
const findKaptKeyForPnu = async (pnu, jibunAddress) => {
  const parsed = parsePnu(pnu);
  const keyword = parsed ? await toPnuSearchKeyword(parsed, jibunAddress) : null;
  if (!keyword) return null;

  const rows = await searchJuso(keyword, 20);
  const matched = rows.filter(
    (row) =>
      row.bdKdcd === JUSO_APARTMENT_KIND &&
      row.admCd === parsed.admCd &&
      String(row.mtYn) === parsed.mtYn &&
      Number(row.lnbrMnnm) === Number(parsed.mainNo) &&
      Number(row.lnbrSlno) === Number(parsed.subNo),
  );

  const codes = new Set();
  for (const row of matched) {
    const key = toJusoRoadKey(row);
    if (!key) continue;
    const kapts = await prisma.kaptComplex.findMany({ where: { isActive: true, ...key }, select: { kaptCode: true } });
    kapts.forEach((kapt) => codes.add(kapt.kaptCode));
  }
  if (codes.size === 0) {
    const byLot = await prisma.kaptComplex.findMany({
      where: { isActive: true, legalDongCode: parsed.admCd, mainLot: Number(parsed.mainNo) },
      select: { kaptCode: true },
      take: 2,
    });
    if (byLot.length === 1) codes.add(byLot[0].kaptCode);
  }
  return codes.size === 1 ? `KAPT:${[...codes][0]}` : null;
};

// sourceKey와 같은 건물을 가리키는 키 목록(입력 키 포함). complex는 getComplexBySourceKey 결과 등 { jibunAddress }.
const getLinkedSourceKeys = async (sourceKey, complex) => {
  const [type, value] = String(sourceKey).split(':');
  let other = null;
  if (type === 'KAPT' && value) other = await findPnuKeyForKapt(value);
  if (type === 'PNU' && value) other = await findKaptKeyForPnu(value, complex?.jibunAddress);
  return other ? [sourceKey, other] : [sourceKey];
};

export const publicProvider = { searchComplexes, getComplexBySourceKey, getLinkedSourceKeys, getUnitInfo };
