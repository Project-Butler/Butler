// 실거래 한 건을 우리 단지(Complex)에 잇기 — 시세 계획서 4절. DB 를 읽지 않는 순수 함수만 둔다(테스트하기 쉽게).
// 순서는 marketPriceRules.LINK_ORDER: 도로명 키 → 지번 → 단지 일련번호(aptSeq). 처음 맞는 것을 쓴다. 이름으로는 잇지 않는다.
// 못 이으면 complexId = null(단지 시세에는 안 나오고 동 시세에는 들어간다).

import { LINK_ORDER, ROAD_UNDERGROUND_WHEN_BLANK } from './marketPriceRules.js';

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

// ===== 색인 =====

const putUnique = (map, key, value) => {
  if (!key) return;
  if (map.has(key) && map.get(key) !== value) map.set(key, AMBIGUOUS);
  else map.set(key, value);
};

// complexes: [{ id, sourceKey, regionId, isMountain, mainLot, subLot, roadCode, isUnderground, buildingMainNo, buildingSubNo }]
// regions: [{ id, dongName }] — 그 시군구들의 법정동. aptSeqHints: [[aptSeq, complexId]] — 앞서 이어진 거래에서 배운 것
export const buildLinkIndex = ({ complexes = [], regions = [], aptSeqHints = [] }) => {
  const byRoad = new Map();
  const byLot = new Map();
  for (const complex of complexes) {
    putUnique(byRoad, complexRoadKey(complex), complex.id);
    if (complex.mainLot !== null && complex.mainLot !== undefined) {
      putUnique(byLot, lotKey(complex.regionId, { isMountain: Boolean(complex.isMountain), mainLot: complex.mainLot, subLot: complex.subLot ?? 0 }), complex.id);
    }
  }
  const regionIdByDong = new Map();
  for (const region of regions) putUnique(regionIdByDong, `${region.id.slice(0, 5)}|${region.dongName}`, region.id);
  for (const [key, value] of regionIdByDong) if (value === AMBIGUOUS) regionIdByDong.delete(key);
  const byAptSeq = new Map();
  for (const [aptSeq, complexId] of aptSeqHints) putUnique(byAptSeq, aptSeq, complexId);
  return { byRoad, byLot, regionIdByDong, byAptSeq };
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

// 저장된 거래의 키 → { complexId, linkMethod }(못 이으면 null 둘). 순서는 linkDeals 와 같다
export const linkStoredKeys = ({ roadKey, lotKey: storedLotKey, aptSeq }, index) => {
  for (const method of LINK_ORDER) {
    const complexId =
      method === 'ROAD' ? found(index.byRoad, roadKey) : method === 'JIBUN' ? found(index.byLot, storedLotKey) : found(index.byAptSeq, aptSeq);
    if (complexId) return { complexId, linkMethod: method };
  }
  return { complexId: null, linkMethod: null };
};

// ===== 잇기 =====

// 거래들 → 같은 순서로 { ...거래, legalDongCode, complexId, linkMethod }. linkMethod: 'ROAD' · 'JIBUN' · 'APT_SEQ' · null
// 1 · 2 로 이어진 거래의 aptSeq 를 배워서(같은 aptSeq 가 두 단지로 이어지면 쓰지 않음) 3 에 쓴다 — 같은 묶음 안의 것과 hints 모두
export const linkDeals = (deals, index) => {
  const learned = new Map(index.byAptSeq);
  const firstPass = deals.map((deal) => {
    const legalDongCode = legalDongCodeOf(deal, index.regionIdByDong);
    for (const method of LINK_ORDER) {
      let complexId = null;
      if (method === 'ROAD') complexId = found(index.byRoad, roadKeyOf(deal.road));
      if (method === 'JIBUN') complexId = found(index.byLot, lotKey(legalDongCode, lotOf(deal)));
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
