// 뉴스 걸러내기 — 받은 기사를 제목 낱말로 걸러 통과한 것만 저장한다. DB·네트워크 없는 순수 함수.
//   전국: 제목에 부동산 낱말이 하나라도 있어야 한다
//   시·군·구: 거기에 더해 그 지역 이름이 제목에 있어야 한다
//   시·도: 거기에 더해 그 시·도 이름(약칭)이 제목에 있어야 한다
//   단지: 단지 이름이 제목에 있고, 이름을 빼고도 부동산 낱말이 있어야 한다(흔하거나 짧은 이름은 동 · 시군구 이름도)
// 낱말 목록 · 표 · 이름 규칙과 그 이유는 newsRules.js 에 있다(이 파일은 읽기만 한다). 아래 세 이름은 예전처럼 다시 내보낸다.
import {
  COMPLEX_MIN_BASE_LENGTH,
  COMPLEX_NAME_SUFFIXES,
  DONG_SUFFIX,
  EXCLUDED_PLACE_TERMS,
  MIN_PLACE_BASE_LENGTH,
  REAL_ESTATE_WORDS,
  SIDO_TABLE,
  SIGUNGU_SUFFIX,
} from './newsRules.js';

export { EXCLUDED_PLACE_TERMS, REAL_ESTATE_WORDS, SIDO_TABLE };

export const toSidoCode = (legalDongCode) => legalDongCode.slice(0, 2);
export const getSido = (sidoCode) => SIDO_TABLE[sidoCode] ?? null;

export const hasRealEstateWord = (title) => REAL_ESTATE_WORDS.some((word) => title.includes(word));
const mentionsSido = (title, sidoCode) => (getSido(sidoCode)?.names ?? []).some((name) => title.includes(name));

// ===== 지역 이름 =====
// 규칙(전국에 하나뿐이면 혼자서도, 여럿이면 시·군·구 · 시·도 이름과 함께, 한 글자로 떼지 않음, 제외 낱말)은 newsRules.js 의 "지역 이름 규칙".
const nameForms = (name, suffix) => {
  const base = name.replace(suffix, '');
  return base !== name && base.length >= MIN_PLACE_BASE_LENGTH ? [name, base] : [name];
};
// "수원시 장안구" 처럼 띄어 쓴 시·군·구는 낱말마다
const sigunguForms = (sigunguName) => sigunguName.split(/\s+/).flatMap((token) => nameForms(token, SIGUNGU_SUFFIX));
const dongForms = (dongName) => nameForms(dongName, DONG_SUFFIX);

// Region 전체로 "이 이름이 몇 개 시·군·구에 있는가" 표를 만든다(수집 한 번에 한 번).
// regions: [{ legalDongCode, sigunguName, dongName }] → Map(이름 → Set(시·군·구 코드 5자리))
export const buildNameIndex = (regions) => {
  const index = new Map();
  const add = (term, sigunguCode) => {
    if (!index.has(term)) index.set(term, new Set());
    index.get(term).add(sigunguCode);
  };
  for (const region of regions) {
    const sigunguCode = region.legalDongCode.slice(0, 5);
    for (const term of sigunguForms(region.sigunguName)) add(term, sigunguCode);
    for (const term of dongForms(region.dongName)) add(term, sigunguCode);
  }
  return index;
};

const isUnique = (term, nameIndex) => (nameIndex.get(term)?.size ?? 1) === 1;

// 한 시·군·구에서 인정할 이름들 → [{ term, kind, context }]  kind: 'SIGUNGU' | 'DONG'
//   context: null(혼자서도) · 'SIDO'(시·도 이름이 함께) · 'SIGUNGU_OR_SIDO'(그 시·군·구 이름이나 시·도 이름이 함께)
// dongNames: 그 시·군·구의 모든 법정동 이름(Region)
export const buildRegionTerms = ({ sigunguName, dongNames = [] }, nameIndex) => {
  const terms = new Map();
  for (const term of sigunguForms(sigunguName)) {
    if (!EXCLUDED_PLACE_TERMS.has(term)) terms.set(term, { kind: 'SIGUNGU', context: isUnique(term, nameIndex) ? null : 'SIDO' });
  }
  for (const term of dongNames.flatMap(dongForms)) {
    if (EXCLUDED_PLACE_TERMS.has(term) || terms.has(term)) continue;
    terms.set(term, { kind: 'DONG', context: isUnique(term, nameIndex) ? null : 'SIGUNGU_OR_SIDO' });
  }
  return [...terms].map(([term, rest]) => ({ term, ...rest }));
};

// ===== 걸러내기 =====
// scope 별 제목 검사 함수. SIGUNGU 는 terms·sidoCode, SIDO 는 sidoCode 가 필요하다.
export const makeTitleFilter = ({ scope, terms = [], sidoCode }) => {
  if (scope === 'NATIONWIDE') return (title) => hasRealEstateWord(title);
  if (scope === 'SIDO') return (title) => hasRealEstateWord(title) && mentionsSido(title, sidoCode);
  // 그 시·군·구를 혼자서도 가리키는 이름(예: "송파구"·"송파") — 여러 곳에 있는 동 이름의 짝이 된다
  const sigunguAnchors = terms.filter(({ kind, context }) => kind === 'SIGUNGU' && context === null).map(({ term }) => term);
  const hasContext = (title, context) => {
    if (context === null) return true;
    if (mentionsSido(title, sidoCode)) return true;
    return context === 'SIGUNGU_OR_SIDO' && sigunguAnchors.some((anchor) => title.includes(anchor));
  };
  return (title) => hasRealEstateWord(title) && terms.some(({ term, context }) => title.includes(term) && hasContext(title, context));
};

// 검색어에 쓸 이름: 접미사 뗀 이름이 혼자서도 인정되면(전국에 하나뿐·두 글자 이상) 그것("송파", "잠실"),
// 아니면 전체 이름("중구", "우동"). 띄어 쓴 시·군·구("수원시 장안구")는 마지막 낱말.
export const toQueryName = (name, kind, nameIndex) => {
  const last = name.split(/\s+/).pop();
  const base = last.replace(kind === 'SIGUNGU' ? SIGUNGU_SUFFIX : DONG_SUFFIX, '');
  return base !== last && base.length >= MIN_PLACE_BASE_LENGTH && isUnique(base, nameIndex) && !EXCLUDED_PLACE_TERMS.has(base) ? base : last;
};

// ===== 단지 기사 =====
// 규칙과 이유는 newsRules.js 의 "단지 기사 거르는 규칙". 이름 비교는 띄어쓰기를 무시한다.
const squash = (text) => text.replace(/\s+/g, '');

// 단지 이름 → { full, base }(띄어쓰기 없앤 것). base 는 접미사("아파트")를 뗀 이름, 뗄 것이 없으면 full 과 같다.
export const complexNameForms = (name) => {
  const full = squash(name);
  const suffix = COMPLEX_NAME_SUFFIXES.find((word) => full.endsWith(word) && full.length > word.length);
  return { full, base: suffix ? full.slice(0, -suffix.length) : full };
};

// 검색어에 쓸 이름: 단지 이름 그대로 + 뗀 이름(3자 이상이고 다를 때). 따옴표는 newsProvider 가 붙인다.
export const toComplexQueryNames = (name) => {
  const { full, base } = complexNameForms(name);
  return base !== full && base.length >= COMPLEX_MIN_BASE_LENGTH ? [name.trim(), base] : [name.trim()];
};

// 단지 기사 제목 검사.
//   sameNameCount: 전국 단지(Complex) 중 뗀 이름이 같은 단지 수(자기 포함). 2 이상이면 흔한 이름
//   dongName · sigunguName: 그 단지의 법정동 · 시군구 — 흔하거나 짧은 이름일 때 제목에 함께 있어야 하는 이름
// 제목 속 단지 이름 찾기: 글자 사이 띄어쓰기는 무시하고, 낱말 처음에서 시작해야 하며(앞에 글자 · 숫자가 붙으면 다른 이름),
// 바로 뒤(띄어쓰기 건너)에 숫자가 오면 다른 단지("잠실우성" 뒤 "4차")로 본다. 규칙의 이유는 newsRules.js.
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const complexNamePattern = (term, flags = '') =>
  new RegExp(`(?<![가-힣A-Za-z0-9])${[...term].map(escapeRegExp).join('\\s*')}(?!\\s*\\d)`, flags);

export const makeComplexTitleFilter = ({ name, sameNameCount = 1, dongName = '', sigunguName = '' }) => {
  const { full, base } = complexNameForms(name);
  const names = [...new Set([full, base])].filter((term) => term.length >= MIN_PLACE_BASE_LENGTH).sort((a, b) => b.length - a.length);
  const finders = names.map((term) => complexNamePattern(term));
  const strippers = names.map((term) => complexNamePattern(term, 'g'));
  const needsContext = base.length < COMPLEX_MIN_BASE_LENGTH || sameNameCount > 1;
  const contextTerms = [...(sigunguName ? sigunguForms(sigunguName) : []), ...(dongName ? dongForms(dongName) : [])]
    .map(squash)
    .filter((term) => term && !EXCLUDED_PLACE_TERMS.has(term));
  return (title) => {
    if (!finders.some((finder) => finder.test(title))) return false;
    // 단지 이름을 빼고 본다 — 이름 안의 "아파트" 로 부동산 낱말 검사를 통과하지 않게, 이름 안의 동 이름으로 동 검사를 통과하지 않게
    const rest = squash(strippers.reduce((text, stripper) => text.replace(stripper, ' '), title));
    if (!hasRealEstateWord(rest)) return false;
    return !needsContext || contextTerms.some((term) => rest.includes(term));
  };
};
