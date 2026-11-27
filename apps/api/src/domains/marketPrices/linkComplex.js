// 실거래 한 건을 우리 단지(Complex)에 잇기 — 시세 계획서 4절. DB 를 읽지 않는 순수 함수만 둔다(테스트하기 쉽게).
// 순서는 marketPriceRules.LINK_ORDER: 도로명 키 → 지번 → 단지 일련번호(aptSeq). 처음 맞는 것을 쓴다. 이름만으로는 잇지 않는다.
// 도로명 키가 같아도 양쪽 지번이 다르면 막는데(ROAD_LINK_NEEDS_SAME_LOT), 도로명 키가 건물 번호까지 정확히 같고 이름이 같은 단지면
// 지번이 달라도 잇는다(#270 — 국토부는 단지 거래를 대표 지번 하나로, 도로명은 호실이 있는 건물 것으로 적는다. 규칙 · 이유는 규칙 파일).
// 수집할 때(linkDeals)와 저장된 거래 다시 잇기(linkStoredKeys)가 같은 판정(byRoadSameLot)을 쓴다.
// 못 이으면 complexId = null(단지 시세에는 안 나오고 동 시세에는 들어간다).

import {
  DANJI_SUFFIX,
  LINK_ORDER,
  NAME_TRAILING_WORD,
  ROAD_LINK_ALLOWS_OTHER_LOT_WHEN_SAME_NAME,
  ROAD_LINK_NEEDS_SAME_LOT,
  ROAD_UNDERGROUND_WHEN_BLANK,
} from './marketPriceRules.js';

const AMBIGUOUS = Symbol('ambiguous');

const toInt = (text) => {
  if (text === null || text === undefined) return null;
  const value = Number(String(text).trim());
  return Number.isInteger(value) && value >= 0 ? value : null;
};

// ===== 키 만들기 =====

// 우리 Complex.sourceKey 와 같은 규칙(A팀 publicProvider.toRoadSourceKey): ROAD:<도로명코드12>-<지하0/1>-<건물본번>-<건물부번>.
// 실거래의 도로명시군구코드(5) + 도로명코드(7) = 도로명코드 12자리. 번호는 앞 0 을 뗀 숫자
export const roadKeyOf = (road) => {
  if (!road) return null;
  const code = `${road.sigunguCode ?? ''}${road.roadCode ?? ''}`;
  const mainNo = toInt(road.mainNoText);
  const subNo = toInt(road.subNoText) ?? 0;
  if (!/^\d{12}$/.test(code) || mainNo === null || mainNo <= 0) return null;
  const underground = road.undergroundCode === '1' ? 1 : road.undergroundCode === '0' ? 0 : ROAD_UNDERGROUND_WHEN_BLANK;
  return `ROAD:${code}-${underground}-${mainNo}-${subNo}`;
};

// 단지 칸으로 같은 키를 만든다 — sourceKey 가 없는 단지(운영자가 만든 단지 등)도 도로명 칸이 있으면 잇는다
const complexRoadKey = (complex) => {
  if (complex.sourceKey?.startsWith('ROAD:')) return complex.sourceKey;
  if (!complex.roadCode || complex.buildingMainNo === null || complex.buildingMainNo === undefined) return null;
  return `ROAD:${complex.roadCode}-${complex.isUnderground ? 1 : 0}-${complex.buildingMainNo}-${complex.buildingSubNo ?? 0}`;
};

// 지번 "232" · "202-3" · "산12-3" → { isMountain, mainLot, subLot }
export const parseJibun = (jibun) => {
  if (!jibun) return null;
  const match = /^\s*(산\s*)?(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(jibun);
  if (!match) return null;
  return { isMountain: Boolean(match[1]), mainLot: Number(match[2]), subLot: match[3] ? Number(match[3]) : 0 };
};

// 거래의 법정동(10자리). 매매는 sggCd + umdCd, 전월세는 umdCd 가 없어서 그 시군구에서 법정동 이름(umdNm)이 같은 Region
export const legalDongCodeOf = (deal, regionIdByDong) => {
  if (deal.sigunguCode && deal.umdCode && /^\d{5}$/.test(deal.sigunguCode) && /^\d{5}$/.test(deal.umdCode)) return `${deal.sigunguCode}${deal.umdCode}`;
  if (deal.sigunguCode && deal.umdName) return regionIdByDong.get(`${deal.sigunguCode}|${deal.umdName}`) ?? null;
  return null;
};

// 거래의 지번 키. 매매는 본번 · 부번 · 산 여부(landCd "2")를 쓰고, 없으면 지번 글자
const lotOf = (deal) => {
  const mainLot = toInt(deal.mainLotText);
  if (mainLot !== null && mainLot > 0) return { isMountain: deal.landCode === '2', mainLot, subLot: toInt(deal.subLotText) ?? 0 };
  return parseJibun(deal.jibun);
};
const lotKey = (regionId, lot) => (regionId && lot ? `${regionId}|${lot.isMountain ? 1 : 0}|${lot.mainLot}|${lot.subLot}` : null);

// 거래의 지번 키(법정동 | 산 | 본번 | 부번) — 저장해 두고 나중에 등록된 단지를 이을 때 쓴다
export const dealLotKey = (deal, legalDongCode) => lotKey(legalDongCode, lotOf(deal));

// ===== 이름 판정(#270, 규칙 파일 NAME_TRAILING_WORD · DANJI_SUFFIX) =====

// 띄어쓰기를 모두 지우고 끝의 "아파트" 하나만 뗀다. "N차" · 괄호 안 글자는 그대로
export const normalizeComplexName = (name) => {
  const compact = String(name ?? '').replace(/\s+/g, '');
  return compact.endsWith(NAME_TRAILING_WORD) ? compact.slice(0, -NAME_TRAILING_WORD.length) : compact;
};
// 정규화한 이름 → { base, number }. 끝이 "N단지" 면 번호를 떼어 따로(없으면 number null)
export const splitDanji = (normalized) => {
  const match = DANJI_SUFFIX.exec(normalized);
  return match ? { base: match[1], number: Number(match[2]) } : { base: normalized, number: null };
};
// 같은 법정동의 거래 이름들 → Map(`법정동|기본 이름` → 번호 단지 번호들 Set). 한쪽에만 번호가 있을 때 판정에 쓴다
export const danjiNumbersOf = (dealNames) => {
  const map = new Map();
  for (const { legalDongCode, aptName } of dealNames) {
    if (!legalDongCode || !aptName) continue;
    const { base, number } = splitDanji(normalizeComplexName(aptName));
    if (number === null || !base) continue;
    const key = `${legalDongCode}|${base}`;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(number);
  }
  return map;
};
// 우리 단지 이름(들)과 거래 이름이 같은 단지인가 — 양쪽 다 번호면 번호까지, 한쪽만 번호면 그 동에 그 기본 이름의 번호 단지가 하나뿐일 때만.
// 번호 단지 세기에는 이 거래 자신의 번호도 넣는다(이 거래도 그 동의 거래 이름이다 — 넘겨받은 이름 목록에 빠져 있어도 같은 판정)
export const sameComplexName = (complexNames, dealName, legalDongCode, danjiNumbers) => {
  const deal = splitDanji(normalizeComplexName(dealName));
  if (!deal.base) return false;
  return complexNames.some((name) => {
    const mine = splitDanji(normalizeComplexName(name));
    if (!mine.base || mine.base !== deal.base) return false;
    if (mine.number !== null && deal.number !== null) return mine.number === deal.number;
    if (mine.number === null && deal.number === null) return true;
    const numbers = new Set(danjiNumbers?.get(`${legalDongCode}|${deal.base}`) ?? []);
    if (deal.number !== null) numbers.add(deal.number);
    return numbers.size === 1;
  });
};

// ===== 색인 =====

const putUnique = (map, key, value) => {
  if (!key) return;
  if (map.has(key) && map.get(key) !== value) map.set(key, AMBIGUOUS);
  else map.set(key, value);
};

// complexes: [{ id, sourceKey, regionId, isMountain, mainLot, subLot, roadCode, isUnderground, buildingMainNo, buildingSubNo, name, buildingName }]
// regions: [{ id, dongName }] — 그 시군구들의 법정동. aptSeqHints: [[aptSeq, complexId]] — 앞서 이어진 거래에서 배운 것
// dealNames: [{ legalDongCode, aptName }] — 그 시군구의 저장된 거래 이름(같은 법정동의 번호 단지 세기, #270)
export const buildLinkIndex = ({ complexes = [], regions = [], aptSeqHints = [], dealNames = [] }) => {
  const byRoad = new Map();
  const byLot = new Map();
  // 단지마다 자기 지번 키 — 도로명이 맞아도 거래 지번이 다르면 도로명으로 잇지 않으려고(ROAD_LINK_NEEDS_SAME_LOT)
  const lotByComplex = new Map();
  // 단지마다 이름들(단지명 · juso 건물명) — 지번이 다를 때 같은 단지인지 확인(#270)
  const namesByComplex = new Map();
  for (const complex of complexes) {
    putUnique(byRoad, complexRoadKey(complex), complex.id);
    namesByComplex.set(complex.id, [complex.name, complex.buildingName].filter(Boolean));
    if (complex.mainLot !== null && complex.mainLot !== undefined) {
      const key = lotKey(complex.regionId, { isMountain: Boolean(complex.isMountain), mainLot: complex.mainLot, subLot: complex.subLot ?? 0 });
      putUnique(byLot, key, complex.id);
      lotByComplex.set(complex.id, key);
    }
  }
  const regionIdByDong = new Map();
  for (const region of regions) putUnique(regionIdByDong, `${region.id.slice(0, 5)}|${region.dongName}`, region.id);
  for (const [key, value] of regionIdByDong) if (value === AMBIGUOUS) regionIdByDong.delete(key);
  const byAptSeq = new Map();
  for (const [aptSeq, complexId] of aptSeqHints) putUnique(byAptSeq, aptSeq, complexId);
  return { byRoad, byLot, lotByComplex, namesByComplex, danjiNumbers: danjiNumbersOf(dealNames), regionIdByDong, byAptSeq };
};

const found = (map, key) => {
  const value = key ? map.get(key) : undefined;
  return value && value !== AMBIGUOUS ? value : null;
};

// 색인에서 하나로만 가리키는 키들 — 저장된 거래 중 이을 후보를 DB 에서 고를 때 쓴다(겹치는 키는 빼고)
export const usableKeys = (index) => {
  const keysOf = (map) => [...map].filter(([, value]) => value !== AMBIGUOUS).map(([key]) => key);
  return { roadKeys: keysOf(index.byRoad), lotKeys: keysOf(index.byLot), aptSeqs: keysOf(index.byAptSeq) };
};

// 도로명 키로 찾은 단지 — 거래와 그 단지 양쪽에 지번이 있고 서로 다르면 null(같은 도로명주소의 다른 단지일 수 있다).
// 예외(#270): 도로명 키는 건물 번호까지 정확히 같은 것이므로(byRoad 의 키), 이름이 같은 단지로 판정되면 지번이 달라도 잇는다.
// dealName · legalDongCode 는 거래의 단지명 · 법정동(한쪽에만 "N단지" 번호가 있을 때 그 동의 번호 단지를 센다)
const byRoadSameLot = (index, roadKey, dealLot, { dealName, legalDongCode } = {}) => {
  const complexId = found(index.byRoad, roadKey);
  if (!complexId || !ROAD_LINK_NEEDS_SAME_LOT) return complexId;
  const ownLot = index.lotByComplex?.get(complexId);
  if (!(ownLot && dealLot && ownLot !== dealLot)) return complexId;
  if (!ROAD_LINK_ALLOWS_OTHER_LOT_WHEN_SAME_NAME) return null;
  return sameComplexName(index.namesByComplex?.get(complexId) ?? [], dealName, legalDongCode, index.danjiNumbers) ? complexId : null;
};

// 저장된 거래의 키 → { complexId, linkMethod }(못 이으면 null 둘). 순서 · 규칙은 linkDeals 와 같다(aptName · legalDongCode 는 #270 이름 확인용)
export const linkStoredKeys = ({ roadKey, lotKey: storedLotKey, aptSeq, aptName, legalDongCode }, index) => {
  for (const method of LINK_ORDER) {
    const complexId =
      method === 'ROAD'
        ? byRoadSameLot(index, roadKey, storedLotKey, { dealName: aptName, legalDongCode })
        : method === 'JIBUN'
          ? found(index.byLot, storedLotKey)
          : found(index.byAptSeq, aptSeq);
    if (complexId) return { complexId, linkMethod: method };
  }
  return { complexId: null, linkMethod: null };
};

// ===== 잇기 =====

// 거래들 → 같은 순서로 { ...거래, legalDongCode, complexId, linkMethod }. linkMethod: 'ROAD' · 'JIBUN' · 'APT_SEQ' · null
// 1 · 2 로 이어진 거래의 aptSeq 를 배워서(같은 aptSeq 가 두 단지로 이어지면 쓰지 않음) 3 에 쓴다 — 같은 묶음 안의 것과 hints 모두
export const linkDeals = (deals, index) => {
  const learned = new Map(index.byAptSeq);
  // 이 묶음의 거래 이름도 같은 법정동의 번호 단지 세기에 더한다(저장된 이름 + 이번 묶음 — 늘어날수록 더 보수적)
  const withDong = deals.map((deal) => ({ deal, legalDongCode: legalDongCodeOf(deal, index.regionIdByDong) }));
  const danjiNumbers = new Map([...(index.danjiNumbers ?? new Map())].map(([key, numbers]) => [key, new Set(numbers)]));
  for (const [key, numbers] of danjiNumbersOf(withDong.map(({ deal, legalDongCode }) => ({ legalDongCode, aptName: deal.aptName })))) {
    if (!danjiNumbers.has(key)) danjiNumbers.set(key, new Set());
    for (const number of numbers) danjiNumbers.get(key).add(number);
  }
  const batchIndex = { ...index, danjiNumbers };
  const firstPass = withDong.map(({ deal, legalDongCode }) => {
    const dealLot = lotKey(legalDongCode, lotOf(deal));
    for (const method of LINK_ORDER) {
      let complexId = null;
      if (method === 'ROAD') complexId = byRoadSameLot(batchIndex, roadKeyOf(deal.road), dealLot, { dealName: deal.aptName, legalDongCode });
      if (method === 'JIBUN') complexId = found(index.byLot, dealLot);
      if (complexId) {
        putUnique(learned, deal.aptSeq, complexId);
        return { ...deal, legalDongCode, complexId, linkMethod: method };
      }
    }
    return { ...deal, legalDongCode, complexId: null, linkMethod: null };
  });
  return firstPass.map((deal) => {
    if (deal.complexId || !LINK_ORDER.includes('APT_SEQ')) return deal;
    const complexId = found(learned, deal.aptSeq);
    return complexId ? { ...deal, complexId, linkMethod: 'APT_SEQ' } : deal;
  });
};
