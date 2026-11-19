// 통합 검색어 해석(api-contract.md 7장 "검색" v1.1, #172). 순수 함수, DB 의존 없음.
// 검색어를 공백으로 나눠, 본인이 볼 수 있는 호실 주소에 맞는 단어는 호실 조건, 나머지는 키워드로 쓴다.
import { normalizeBuildingNo, normalizeUnitNo } from '../../platform/unitAddress.js';

export const SEARCH_TYPES = ['PROPERTY', 'CONTRACT', 'TICKET', 'MANAGEMENT_LOG', 'DOCUMENT', 'SCHEDULE'];
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 50;
export const MAX_RESULTS_PER_TYPE = 10;

// 같은 단어는 한 번만 쓴다(대소문자 무시).
export const splitQuery = (query) => {
  const seen = new Set();
  return query
    .trim()
    .split(/\s+/)
    .filter((token) => {
      const key = token.toLowerCase();
      if (!token || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const SUFFIXED = /^(.+?)(동|호)$/;

// property: { buildingNo, unitNo, complex: { name } }. 단어가 이 호실 주소에 맞는지.
//   '101동' → 동 번호와 같음, '1203호' → 호 번호와 같음, 숫자·라틴만('101') → 동 또는 호와 같음, 그 밖 → 단지명에 포함.
export const tokenMatchesProperty = (token, property) => {
  const lower = token.toLowerCase();
  if (property.complex.name.toLowerCase().includes(lower)) return true;
  const suffixed = SUFFIXED.exec(token);
  if (suffixed && /[0-9A-Za-z]/.test(suffixed[1])) {
    if (suffixed[2] === '동') return Boolean(property.buildingNo) && normalizeBuildingNo(token) === property.buildingNo;
    return normalizeUnitNo(token) === property.unitNo;
  }
  if (/^[0-9A-Za-z-]+$/.test(token)) {
    const upper = token.toUpperCase();
    return upper === property.buildingNo || upper === property.unitNo;
  }
  return false;
};

// properties: 본인이 볼 수 있는 호실 전부(끝난 소유·계약 포함).
// 반환: { scopeTokens, keywords, scopedPropertyIds }. 호실 조건이 없으면 scopedPropertyIds는 null(호실 제한 없음).
export const interpretQuery = (query, properties) => {
  const tokens = splitQuery(query);
  const scopeTokens = tokens.filter((token) => properties.some((property) => tokenMatchesProperty(token, property)));
  const keywords = tokens.filter((token) => !scopeTokens.includes(token));
  if (scopeTokens.length === 0) return { scopeTokens, keywords, scopedPropertyIds: null };
  const scopedPropertyIds = properties
    .filter((property) => scopeTokens.every((token) => tokenMatchesProperty(token, property)))
    .map((property) => property.id);
  return { scopeTokens, keywords, scopedPropertyIds };
};

// 키워드를 모두 포함하는지(대소문자 무시). 메모리에서 거르는 일정에 쓴다.
export const includesAllKeywords = (text, keywords) => {
  const lower = (text ?? '').toLowerCase();
  return keywords.every((keyword) => lower.includes(keyword.toLowerCase()));
};

// Prisma where: 키워드마다 fields 중 하나에 포함(대소문자 무시)되어야 한다.
export const keywordsWhere = (keywords, fields) =>
  keywords.length === 0
    ? {}
    : { AND: keywords.map((keyword) => ({ OR: fields.map((field) => ({ [field]: { contains: keyword, mode: 'insensitive' } })) })) };
