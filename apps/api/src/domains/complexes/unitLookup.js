// 동·호 조회(건축HUB)에서 동 이름·호 표기를 맞추는 규칙과 동 조회 정보 캐시 판단(순수 함수, DB·외부 호출 없음).
// publicProvider.getUnitInfo가 쓴다. 저장 형식은 complex_building_lookups(동 단위 "찾는 방법"만, 면적·층 없음).
import { normalizeBuildingNo } from '../../platform/unitAddress.js';

// 저장된 방법이 이 횟수 이상 연속으로 실패하면 바로 찾기 절차로 간다.
export const MAX_LOOKUP_MISSES = 3;
// 동을 어느 필지 대장에서도 못 찾은 경우의 음성 캐시 유지 시간
export const LOOKUP_MISS_TTL_MS = 6 * 60 * 60 * 1000;

// 호 표기: 'N'(1203) → 'N호'(1203호) → 'F층N호'(12층1203호) → 'D동 N호'(동 칸 비우고 호 칸에 '101동 303호')
export const HO_FORMATS = ['N', 'N호', 'F층N호', 'D동 N호'];
const DONG_IN_HO_FORMAT = 'D동 N호';

// 대장 동 이름 비교 키: '제103동'·'주건축물제103동'·'103 동'·'１０３' → '103', '가동' → '가'
export const toDongCompareKey = (value) => {
  const normalized = normalizeBuildingNo(String(value ?? ''));
  return normalized.replace(/동$/, '');
};

const toCompact = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/g, '');

// 대장 동 이름(dongNm 원문)이 단지명과 같은지(동 칸에 단지명이 들어간 단일 동 단지).
const isComplexNameDong = (dongNm, complexName) => {
  const compact = toCompact(dongNm).replace(/아파트$/, '');
  const name = toCompact(complexName).replace(/아파트$/, '');
  return compact.length > 0 && name.length > 0 && (compact === name || name.includes(compact) || compact.includes(name));
};

// 표제부 행들에서 입력 동(dongKey)에 맞는 대장 동 이름을 찾는다.
//   { registryDongNm: '제103동', hoFormats: HO_FORMATS } — 동 이름이 맞음
//   { registryDongNm: '스카이빌' | null, hoFormats: ['D동 N호'] } — 동 칸이 비었거나 단지명(호 칸에 동이 들어감)
//   null — 이 필지에 그런 동 없음
export const findRegistryDong = (titles, dongKey, complexName) => {
  const target = toDongCompareKey(dongKey);
  if (!target) return null;
  const named = titles.find((title) => toDongCompareKey(title.dongNm) === target);
  if (named) return { registryDongNm: String(named.dongNm).trim(), hoFormats: HO_FORMATS };

  // 동 이름이 따로 있는 필지(대단지의 다른 동 필지 등)에서는 쓰지 않는다 — 모든 행이 빈 칸·단지명일 때만.
  const isUnnamed = (title) => !toCompact(title.dongNm) || isComplexNameDong(title.dongNm, complexName);
  const unnamed = titles.length > 0 && titles.every(isUnnamed) ? titles[0] : null;
  if (unnamed) {
    const dongNm = String(unnamed.dongNm ?? '').trim();
    return { registryDongNm: dongNm || null, hoFormats: [DONG_IN_HO_FORMAT] };
  }
  return null;
};

// '1203' → 12, '304' → 3. 숫자 3자리 이상일 때만(앞 자리 = 층).
const toFloorFromUnit = (unitValue) => {
  if (!/^\d{3,5}$/.test(unitValue)) return null;
  const floor = Math.floor(Number(unitValue) / 100);
  return floor > 0 ? floor : null;
};

// 호 형식 하나 → 건축HUB 요청 값 { hoFormat, hoNm, omitDong } (만들 수 없는 형식이면 null)
export const toHoRequest = (hoFormat, unitNo, dongKey) => {
  const unitValue = String(unitNo).replace(/호$/, '');
  if (hoFormat === 'N') return { hoFormat, hoNm: unitValue, omitDong: false };
  if (hoFormat === 'N호') return { hoFormat, hoNm: `${unitValue}호`, omitDong: false };
  if (hoFormat === 'F층N호') {
    const floor = toFloorFromUnit(unitValue);
    return floor ? { hoFormat, hoNm: `${floor}층${unitValue}호`, omitDong: false } : null;
  }
  if (hoFormat === DONG_IN_HO_FORMAT) {
    const dong = toDongCompareKey(dongKey);
    return dong ? { hoFormat, hoNm: `${dong}동 ${unitValue}호`, omitDong: true } : null;
  }
  return null;
};

// 시도할 호 요청 목록. preferred(저장된 형식)를 맨 앞에 둔다. formats 밖의 값은 무시한다.
export const toHoRequests = (formats, unitNo, dongKey, preferred) => {
  const ordered = preferred && formats.includes(preferred) ? [preferred, ...formats.filter((f) => f !== preferred)] : formats;
  return ordered.map((format) => toHoRequest(format, unitNo, dongKey)).filter(Boolean);
};

// 전유공용면적 응답에서 요청한 호의 전유 행만. 'D동 N호'는 공백 차이를 무시하고 비교한다.
export const filterExclusiveRows = (rows, { registryDongNm, hoNm, omitDong }) =>
  rows.filter((row) => {
    if (row.exposPubuseGbCdNm !== '전유') return false;
    if (omitDong) return toCompact(row.hoNm) === toCompact(hoNm);
    return String(row.dongNm ?? '').trim() === registryDongNm && String(row.hoNm) === hoNm;
  });

// 전유 행들 → { exclusiveArea, floor }
export const toUnitInfo = (exclusiveRows) => {
  // 전유 부분이 여러 행으로 나뉜 호실도 있어서 면적은 합친다.
  const totalArea = exclusiveRows.reduce((sum, row) => sum + (Number(row.area) || 0), 0);
  const [first] = exclusiveRows;
  const floorNo = Number.parseInt(first.flrNo, 10);
  const isUnderground = first.flrGbCdNm === '지하' || first.flrGbCd === '10';
  return {
    exclusiveArea: totalArea > 0 ? Math.round(totalArea * 100) / 100 : null,
    floor: Number.isInteger(floorNo) ? (isUnderground ? -floorNo : floorNo) : null,
  };
};

// 저장된 방법을 먼저 써 볼지(연속 실패가 적을 때만)
export const shouldUseStoredLookup = (lookup) => Boolean(lookup) && lookup.missCount < MAX_LOOKUP_MISSES;

export const isMissActive = (miss, now) => Boolean(miss) && miss.expiresAt.getTime() > now.getTime();

// 찾기 절차가 끝난 뒤 무엇을 저장할지.
//   found: 호실을 찾음 / dongFound: 어느 필지에서든 대장 동을 찾음 / hadError: 외부 호출 실패가 있었음
//   'upsert'(동 조회 정보 저장) | 'miss'(음성 캐시 — 동을 못 찾았고 실패도 없음) | 'none'
// 호만 못 찾은 경우(입력 오타일 수 있음)와 외부 장애는 저장하지 않는다.
export const decideDiscoveryWrite = ({ found, dongFound, hadError }) => {
  if (found) return 'upsert';
  if (!dongFound && !hadError) return 'miss';
  return 'none';
};

// 저장된 방법이 실패한 뒤 동 수준 확인 결과에 따라
//   dongExists true  → 'keep'(호 표기만 문제 — 저장값 유지, miss_count +1)
//   dongExists false → 'rediscover'(저장값이 낡음 — 찾기 절차, 성공하면 덮어씀)
//   null(확인 호출 실패) → 'rediscover'
export const decideAfterStoredMiss = (dongExists) => (dongExists === true ? 'keep' : 'rediscover');
