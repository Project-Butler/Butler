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
import { ExternalServiceError } from './ExternalServiceError.js';
import { buildPnu, parsePnu, rollUpLegalDongCode, toBuildingRegisterParams } from './pnu.js';
import { fetchJson, readDataGoKrBody, toItemArray } from './publicApi.js';

const JUSO_BASE_URL = 'https://business.juso.go.kr/addrlink/addrLinkApi.do';
const KAPT_LIST_URL = 'https://apis.data.go.kr/1613000/AptListService4/getLegaldongAptList4';
const KAPT_BASIS_URL = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5';
const BUILDING_HUB_BASE_URL = 'https://apis.data.go.kr/1613000/BldRgstHubService';
const BUILDING_HUB_RECAP_URL = `${BUILDING_HUB_BASE_URL}/getBrRecapTitleInfo`; // 총괄표제부
const BUILDING_HUB_TITLE_URL = `${BUILDING_HUB_BASE_URL}/getBrTitleInfo`; // 표제부
const BUILDING_HUB_EXPOS_URL = `${BUILDING_HUB_BASE_URL}/getBrExposPubuseAreaInfo`; // 전유공용면적

const MAX_JUSO_ROWS = 50;
const MAX_LEGAL_DONGS_PER_SEARCH = 5;
const KAPT_LIST_PAGE_SIZE = 100;
const KAPT_LIST_MAX_PAGES = 5;
const BUILDING_HUB_PAGE_SIZE = 100;

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

const fetchKaptBasis = async (kaptCode) => {
  const json = await fetchJson('kapt-basis', KAPT_BASIS_URL, {
    serviceKey: process.env.DATA_GO_KR_SERVICE_KEY,
    kaptCode,
  });
  const body = readDataGoKrBody('kapt-basis', json);
  const item = body?.item;
  // 없는 kaptCode는 모든 값이 null인 item으로 온다.
  if (!item || !item.kaptCode) return null;
  return item;
};

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

const searchComplexes = async (query, size) => {
  const jusoRows = await searchJuso(query, Math.min(size * 2, MAX_JUSO_ROWS));
  const apartments = jusoRows.filter((juso) => juso.bdKdcd === JUSO_APARTMENT_KIND && trimOrNull(juso.bdNm));

  const admCds = [...new Set(apartments.map((juso) => juso.admCd))].slice(0, MAX_LEGAL_DONGS_PER_SEARCH);
  const kaptLists = await getKaptLists(admCds);

  const results = [];
  const seen = new Set();
  for (const juso of apartments) {
    // 법정동 5개를 넘는 결과는 K-apt를 조회하지 않았으므로 버린다.
    if (!kaptLists.has(juso.admCd)) continue;

    const kapt = matchKaptComplex(juso.bdNm, kaptLists.get(juso.admCd));
    let sourceKey = null;
    if (kapt) {
      sourceKey = `KAPT:${kapt.kaptCode}`;
    } else {
      const pnu = toJusoPnu(juso);
      if (pnu) sourceKey = `PNU:${pnu}`;
    }
    if (!sourceKey || seen.has(sourceKey)) continue;
    seen.add(sourceKey);

    results.push({
      sourceKey,
      name: kapt ? kapt.kaptName : juso.bdNm.trim(),
      jibunAddress: trimOrNull(juso.jibunAddr),
      roadAddress: trimOrNull(juso.roadAddrPart1),
      legalDongCode: rollUpLegalDongCode(juso.admCd),
    });
    if (results.length >= size) break;
  }
  return results;
};

const getKaptComplex = async (sourceKey, kaptCode) => {
  const basis = await fetchKaptBasis(kaptCode);
  if (!basis || !/^\d{10}$/.test(String(basis.bjdCode ?? ''))) return null;

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

const resolveComplexPnu = async (complex) => {
  const [type, value] = String(complex.sourceKey ?? '').split(':');
  if (type === 'PNU') return value;
  return findPnuByAddress(complex);
};

// 건축HUB 동 이름은 '101동' 형식이 대부분이라 그것부터, 없으면 입력값 그대로 찾는다.
const toDongNameCandidates = (buildingNo) => {
  const value = String(buildingNo);
  return value.endsWith('동') ? [value] : [`${value}동`, value];
};

const getUnitInfo = async ({ complex, buildingNo, unitNo }) => {
  const pnu = await resolveComplexPnu(complex);
  const params = pnu ? toBuildingRegisterParams(pnu) : null;
  if (!params) return null;

  // 호 이름도 단지마다 '1203'(파크리오)·'304호'(가평읍내주공)로 표기가 달라서 둘 다 찾아본다.
  const unitValue = String(unitNo).replace(/호$/, '');
  const candidates = toDongNameCandidates(buildingNo).flatMap((dongNm) =>
    [unitValue, `${unitValue}호`].map((hoNm) => ({ dongNm, hoNm })),
  );
  // 순서대로 부르면 느린 첫 조회가 겹쳐 Vercel 함수 제한(10초)을 넘을 수 있어서 동시에 부르고,
  // 앞 순서 후보의 결과를 쓴다. 하나도 못 찾았는데 실패한 호출이 있으면 그 실패(→ 503)를 낸다.
  const results = await Promise.allSettled(
    candidates.map(({ dongNm, hoNm }) =>
      fetchBuildingHub('hub-expos', BUILDING_HUB_EXPOS_URL, { ...params, dongNm, hoNm }),
    ),
  );
  for (const [index, result] of results.entries()) {
    if (result.status !== 'fulfilled') continue;
    const { dongNm, hoNm } = candidates[index];
    const exclusiveRows = result.value.filter(
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
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
  return null;
};

export const publicProvider = { searchComplexes, getComplexBySourceKey, getUnitInfo };
