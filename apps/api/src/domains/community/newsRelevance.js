// 뉴스 걸러내기 — 받은 기사를 제목 낱말로 걸러 통과한 것만 저장한다. DB·네트워크 없는 순수 함수.
//   전국: 제목에 부동산 낱말이 하나라도 있어야 한다
//   시·군·구: 거기에 더해 그 지역 이름이 제목에 있어야 한다
//   시·도: 거기에 더해 그 시·도 이름(약칭)이 제목에 있어야 한다
// 낱말 목록은 운영하며 다듬는다.

// ===== 부동산 낱말(임대인 관심사) =====
// "임대"·"임차" 단독은 빼고 좁혔다(지하철 차량 임대 같은 오탐). "매매"도 "인신매매·마약 매매"에 걸려 좁혔다.
export const REAL_ESTATE_WORDS = [
  '전세', '월세', '전월세', '임대차', '임대인', '임대료', '임대주택', '임대사업자', '임차인', '임차권',
  '보증금', '집주인', '세입자', '아파트', '오피스텔', '빌라', '주택', '재건축', '재개발', '분양', '청약',
  '집값', '매매가', '매매 거래', '매매거래', '실거래', '공시가격', '보유세', '종부세', '재산세', '부동산',
];

// ===== 시·도 약칭(17개 고정 표) =====
// 법정동코드 앞 2자리 → 제목에서 인정할 이름과 화면·검색어용 약칭. 옛 코드(광주 29 · 강원 42 · 전북 45 · 전남 46)와
// 새 코드(강원특별자치도 51 · 전북특별자치도 52 · 전남광주통합특별시 12)를 모두 잇는다 — 시드 Region 은 새 코드다.
export const SIDO_TABLE = {
  11: { label: '서울', names: ['서울'] },
  26: { label: '부산', names: ['부산'] },
  27: { label: '대구', names: ['대구'] },
  28: { label: '인천', names: ['인천'] },
  29: { label: '광주', names: ['광주'] },
  30: { label: '대전', names: ['대전'] },
  31: { label: '울산', names: ['울산'] },
  36: { label: '세종', names: ['세종'] },
  41: { label: '경기', names: ['경기'] },
  42: { label: '강원', names: ['강원'] },
  43: { label: '충북', names: ['충북', '충청북도'] },
  44: { label: '충남', names: ['충남', '충청남도'] },
  45: { label: '전북', names: ['전북', '전라북도'] },
  46: { label: '전남', names: ['전남', '전라남도'] },
  47: { label: '경북', names: ['경북', '경상북도'] },
  48: { label: '경남', names: ['경남', '경상남도'] },
  50: { label: '제주', names: ['제주'] },
  51: { label: '강원', names: ['강원'] },
  52: { label: '전북', names: ['전북', '전라북도'] },
  12: { label: '광주·전남', names: ['광주', '전남', '전라남도'] },
};

export const toSidoCode = (legalDongCode) => legalDongCode.slice(0, 2);
export const getSido = (sidoCode) => SIDO_TABLE[sidoCode] ?? null;

export const hasRealEstateWord = (title) => REAL_ESTATE_WORDS.some((word) => title.includes(word));
const mentionsSido = (title, sidoCode) => (getSido(sidoCode)?.names ?? []).some((name) => title.includes(name));

// ===== 지역 이름 =====
// 시·군·구 이름("송파구"·"송파")과 그 시·군·구의 **모든** 법정동 이름("잠실동"·"잠실")을 인정한다.
//   - 이름(전체든 접미사 뗀 것이든)이 전국에 한 시·군·구에만 있으면 혼자서도 인정
//   - 여러 시·군·구에 있으면 같은 제목에 그 시·군·구 이름이나 시·도 이름이 함께 있어야 인정
//     (시·군·구 이름 자체가 여러 곳에 있으면 — 중구·동구 — 시·도 이름이 함께 있어야)
//   - 접미사를 떼서 한 글자가 되면 뗀 이름은 쓰지 않는다("우동" → "우" 안 씀)
//   - 흔한 낱말과 겹치는 이름은 EXCLUDED_PLACE_TERMS 로 뺀다
const SIGUNGU_SUFFIX = /(시|군|구)$/;
const DONG_SUFFIX = /(동|읍|면|리|가)$/;

// 흔한 낱말과 겹쳐 지역 이름으로 쓰지 않는 것(실제 수집에서 오탐이 난 이름). 전체 이름("삼전동")은 그대로 인정된다.
//   삼전 — "삼전"(삼성전자 줄임말), 방이 — "방이 3개" 같은 표현
export const EXCLUDED_PLACE_TERMS = new Set(['삼전', '방이']);

const nameForms = (name, suffix) => {
  const base = name.replace(suffix, '');
  return base !== name && base.length >= 2 ? [name, base] : [name];
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
  return base !== last && base.length >= 2 && isUnique(base, nameIndex) && !EXCLUDED_PLACE_TERMS.has(base) ? base : last;
};
