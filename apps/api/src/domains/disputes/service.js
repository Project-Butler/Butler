import { DisputeCategory, DisputeReferenceType, Prisma } from '@prisma/client';
import { prisma } from '../../platform/prismaClient.js';
import {
  findMatchRule,
  findSynonyms,
  findVerbNouns,
  isReplacedWord,
  isSameMeaning,
  isStopWord,
  replaceSearchWord,
} from './searchSynonyms.js';
import { findLegalReferences, normalizeLegalReferences, toLawTitlePatterns, toLegalReferencePattern } from './legalReferences.js';
import { findClosestWord, latinToHangul, toJamo } from './searchSuggestion.js';
import { toSourceUrl } from './sourceLinks.js';

export const SORTABLE_FIELDS = ['createdAt', 'title', 'sourcePage'];
// 관련도 순은 컬럼이 아니라 검색어로 계산한 점수라 검색어가 있을 때만 쓴다(controller.js).
export const RELEVANCE_SORT_FIELD = 'relevance';
// Prisma는 nullable 컬럼에만 nulls 옵션을 받는다.
const NULLABLE_SORT_FIELDS = ['sourcePage'];

const buildOrderBy = ({ field, direction }) => [
  { [field]: NULLABLE_SORT_FIELDS.includes(field) ? { sort: direction, nulls: 'last' } : direction },
  // 같은 값끼리 순서가 페이지마다 바뀌지 않도록 id로 한 번 더 정렬한다.
  { id: 'asc' },
];

// 목록에는 본문(content)과 결과(outcome)를 빼고 보낸다.
const LIST_SELECT = {
  id: true,
  type: true,
  propertyKind: true,
  category: true,
  title: true,
  summary: true,
  keywords: true,
  sourceTitle: true,
  sourcePage: true,
  // 원문 링크(sourceUrl)를 만드는 데만 쓰고 응답에서는 뺀다(toListItem).
  sourceKey: true,
  caseNumber: true,
};

const toListItem = ({ sourceKey, caseNumber, ...item }) => ({
  ...item,
  sourceUrl: toSourceUrl({ sourceKey, title: item.title, caseNumber }),
});

// 검색어를 공백으로 나눈 단어 목록(중복 제거). "보증금 반환"은 ['보증금', '반환'].
// 불용어("싶어요"·"방법"·"어떻게", searchSynonyms.js)는 뺀다. 다 빠지면("방법") 그대로 찾는다.
// 사건번호·조문은 한 가지 모양으로 붙여 쓴 뒤 나눈다("2020다 226452" → "2020다226452", "6조의 3" → "제6조의3", legalReferences.js).
export const toSearchTerms = (keyword) => {
  const words = [...new Set(normalizeLegalReferences(keyword).split(/\s+/).filter(Boolean))];
  const kept = words.filter((word) => !isStopWord(word));
  return kept.length > 0 ? kept : words;
};

// 비용을 뜻하는 끝말. 자료에는 "도배비"보다 "도배·장판", "도배 35만 원"처럼 쓰인 경우가 많아서
// 이 끝말로 끝나는 단어는 끝말을 뗀 말로도 찾는다. 긴 끝말을 먼저 본다("도배비용"은 "도배").
const COST_SUFFIXES = ['비용', '비'];
// 남는 말이 한 글자면 떼지 않는다("준비"→"준", "설비"→"설"처럼 뜻이 없어지는 경우를 막는다).
const MIN_STEM_LENGTH = 2;

const stripCostSuffix = (term) => {
  const suffix = COST_SUFFIXES.find((candidate) => term.endsWith(candidate));
  const stem = suffix ? term.slice(0, -suffix.length) : '';
  return stem.length >= MIN_STEM_LENGTH ? [term, stem] : [term];
};

// 단어 끝에 붙은 조사. "보증금을 반환"처럼 조사를 붙여 검색하면 "보증금"만 쓰인 자료를 못 찾아서
// 조사를 뗀 말로도 찾는다(원래 말도 그대로 찾는다). 긴 조사를 먼저 본다("으로"가 "로"보다 앞).
// 남는 말이 한 글자면 떼지 않는다(MIN_STEM_LENGTH) — "명도"→"명", "결과"→"결", "합의"→"합"을 막는다.
const PARTICLES = [
  '에서는', '으로는', '에게서', '이라도', '만으로', '으로서', '으로써', '에서도', '으로도', '에서의', '에게는',
  '에서', '에게', '한테', '으로', '부터', '까지', '이나', '이랑', '에는', '에도', '과의', '와의', '로서', '로써',
  '은', '는', '이', '가', '을', '를', '에', '의', '로', '와', '과', '도', '만',
];

// 조사처럼 끝나지만 명사의 일부인 끝말. 이 말로 끝나면 조사를 떼지 않는다.
// 자료에서 뒤에 조사가 또 붙어 쓰이는 단어를 세어 골랐다: 채권양도·건물명도·사업연도, 감정평가·건축허가·인허가,
// 배당이의·청구이의, 채무초과, 곰팡이, 스스로.
const NOUN_ENDINGS = [
  '양도', '명도', '연도', '제도', '한도', '정도', '용도', '의도', '태도', '수도', '도로',
  '평가', '허가', '대가', '시가', '원가', '단가', '주택가', '곰팡이',
  '이의', '합의', '협의', '동의', '고의', '임의', '선의', '악의', '신의',
  '초과', '결과', '효과', '부과', '스스로', '경로', '통로',
];

// 동사(VERB_NOUNS)로 시작하는 말은 조사를 떼지 않는다 — 동사 형태로 찾고("나가는"→"나가"), "원래대로"가 "원래대"로 잘리지 않게.
const stripParticle = (term) => {
  if (NOUN_ENDINGS.some((ending) => term.endsWith(ending)) || findVerbNouns(term)) return [term];
  const particle = PARTICLES.find((candidate) => term.endsWith(candidate));
  const stem = particle ? term.slice(0, -particle.length) : '';
  return stem.length >= MIN_STEM_LENGTH ? [term, stem] : [term];
};

// 입력한 단어를 실제로 찾을 말로: 조사를 뗀 말을 더하고 바꿔 찾기(searchSynonyms.js)를 적용한다.
// 조사를 뗀 말이 바꿔 찾기 대상이면("복비를"→"복비") 원래 말("복비를")은 찾지 않는다 — "원상회복비를"에 걸리지 않게.
const toBaseWords = (term) => {
  const forms = stripParticle(term);
  const replaced = forms.filter(isReplacedWord);
  return replaced.length > 0 ? replaced.flatMap(replaceSearchWord) : forms;
};

// 동사(searchSynonyms.js VERB_NOUNS)로 시작하는 말: 맞은 동사 형태(두 글자 이상만)는 입력한 말처럼, 법률 명사는 동의어처럼 찾는다.
const toVerbVariants = (words) => {
  const matches = words.map(findVerbNouns).filter(Boolean);
  return {
    forms: matches.map(({ form }) => form).filter((form) => form.length >= MIN_STEM_LENGTH),
    nouns: matches.flatMap(({ nouns }) => nouns),
  };
};

// 점수 배율: 입력한 말(바꿔 찾기·조사·비용 끝말을 뗀 말·동사 형태 포함) 2배 / 입력한 말과 같은 뜻 묶음의 동의어 1.5배 /
// 한 방향 동의어(집주인→임대인)·동사의 법률 명사·법률 명사의 동의어 1배.
// 같은 뜻 묶음(수리↔수선, 월세↔차임)은 자료가 법률 용어 쪽으로 쓰인 경우가 많아, 1배면 흔한 단어 가중치와 곱해져
// 일상어로 검색할 때 법률 용어 자료가 크게 밀렸다(③ "임대인 수리 의무"). 그래도 같은 필드라면 입력한 말이 앞선다.
const TYPED_FACTOR = 2;
const SAME_MEANING_FACTOR = 1.5;
const SYNONYM_FACTOR = 1;

const toWeightedVariants = (term) => {
  const baseWords = [...new Set(toBaseWords(term).flatMap(stripCostSuffix))];
  const verb = toVerbVariants(baseWords);
  const words = [...new Set([...baseWords, ...verb.forms])];
  const synonyms = [...new Set([...verb.nouns, ...[...words, ...verb.nouns].flatMap(findSynonyms)])].filter(
    (synonym) => !words.includes(synonym),
  );
  const synonymFactor = (synonym) =>
    words.some((word) => isSameMeaning(word, synonym)) ? SAME_MEANING_FACTOR : SYNONYM_FACTOR;
  return [
    ...words.map((text) => ({ text, factor: TYPED_FACTOR })),
    ...synonyms.map((text) => ({ text, factor: synonymFactor(text) })),
  ];
};

// 단어 하나로 찾을 말 목록: 단어 그대로 + 조사를 뗀 말 + 비용 끝말을 뗀 말 + 동사 형태 + 동의어·법률 명사.
// "도배비"는 ['도배비', '도배'], "월세"는 ['월세', '차임', '임대료'], "수리비"는 ['수리비', '수리', '수선'],
// "보증금을"은 ['보증금을', '보증금'], "월세를"은 ['월세를', '월세', '차임', '임대료'],
// "돌려받고"는 ['돌려받고', '돌려받', '반환'], "밀려서"는 ['밀려서', '밀려', '연체', '체납', '미납'].
export const toTermVariants = (term) => toWeightedVariants(term).map(({ text }) => text);

// ── 찾는 말이 필드에 있는지 ──
// 대소문자 무시 포함 검색(ILIKE, Prisma contains와 같음)에 단어 경계 규칙(searchSynonyms.js MATCH_RULES)을 더한다:
// excludes 낱말은 지우고 찾고("수선"을 찾을 때 "장기수선충당금"은 빼고), wordStart면 낱말 첫머리일 때만 인정한다("하자"는 "요구하자"에 안 걸림).
// 검색 조건·관련도 점수·조건 완화 단어 수·흔한 단어 건수가 모두 이 규칙을 쓴다. FAQ(JS)는 containsSearchText가 같은 규칙.

// ILIKE에서 %, _, \는 특수 문자라 글자 그대로 찾도록 이스케이프한다(Prisma contains와 같은 결과).
const escapeLike = (text) => text.replace(/[\\%_]/g, (char) => `\\${char}`);
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 앞이 글 첫머리이거나 한글이 아닌 글자(띄어쓰기·문장부호)일 때
const WORD_START_PATTERN = '(^|[^가-힣])';

// 사건번호(판례만 있음, "대법원 2020. 5. 26. 선고 2020다226452 판결")도 찾는다 — "대법원 2020다226452"처럼 법원 이름을 붙여도 걸리게.
const CASE_NUMBER_COLUMN = "coalesce(case_number, '')";
const SEARCH_COLUMNS = ['title', 'summary', 'content', "coalesce(outcome, '')", CASE_NUMBER_COLUMN];

// 띄어쓰기 차이 흡수: 공백 없는 네 글자 이상의 말은 자료 쪽 공백(띄어쓰기·줄바꿈·탭)을 지우고 비교한다 —
// "묵시적갱신"으로 찾아도 "묵시적 갱신"이 쓰인 자료(55건)가 걸린다. 공백을 지워도 원래 붙어 있던 말은 그대로 걸리므로 결과가 줄지 않는다.
// 세 글자 이하는 하지 않는다: 낱말 경계를 넘어 붙으면서 엉뚱한 말이 생긴다("임대 인상" → "임대인상"에 "임대인").
// 경계 규칙(MATCH_RULES)이 있는 말은 규칙대로만 찾는다.
const SPACELESS_MIN_LENGTH = 4;
const WHITESPACE_CHARS = ' \n\r\t';
const isSpacelessText = (text) => !/\s/.test(text) && [...text].length >= SPACELESS_MIN_LENGTH;

const toColumnMatchSql = (column, text) => {
  // 사건번호·조문은 경계를 지켜 찾는다("2020다22645" ✕ "2020다226452", "제6조" ✕ "제6조의3")
  const legalPattern = toLegalReferencePattern(text);
  if (legalPattern) return Prisma.sql`${Prisma.raw(column)} ~ ${legalPattern}`;
  const rule = findMatchRule(text);
  if (!rule && isSpacelessText(text)) {
    return Prisma.sql`translate(${Prisma.raw(column)}, ${WHITESPACE_CHARS}, '') ILIKE ${`%${escapeLike(text)}%`}`;
  }
  const target = (rule?.excludes ?? []).reduce(
    (expression, excluded) => Prisma.sql`replace(${expression}, ${excluded}, ' ')`,
    Prisma.raw(column),
  );
  return rule?.wordStart
    ? Prisma.sql`${target} ~ ${WORD_START_PATTERN + escapeRegex(text)}`
    : Prisma.sql`${target} ILIKE ${`%${escapeLike(text)}%`}`;
};

// 키워드와 같은지. 네 글자 이상은 키워드도 공백을 지우고 비교한다(키워드 "묵시적 갱신" = "묵시적갱신").
const toKeywordMatchSql = (text) =>
  isSpacelessText(text)
    ? Prisma.sql`EXISTS (SELECT 1 FROM unnest(keywords) AS keyword WHERE translate(keyword, ${WHITESPACE_CHARS}, '') = ${text})`
    : Prisma.sql`${text} = ANY(keywords)`;

// 단어 하나(조사·끝말·동의어 포함)가 제목·요약·본문·결과 중 한 곳에 있거나 키워드와 같으면 참.
const toTermMatchSql = (term) =>
  Prisma.join(
    toTermVariants(term).flatMap((text) => [
      ...SEARCH_COLUMNS.map((column) => toColumnMatchSql(column, text)),
      toKeywordMatchSql(text),
    ]),
    ' OR ',
  );

// FAQ(faqs.js)가 JS로 찾을 때 쓰는 같은 규칙. text는 소문자로 바꾼 질문·답.
export const containsSearchText = (text, variant) => {
  const legalPattern = toLegalReferencePattern(variant);
  if (legalPattern) return new RegExp(legalPattern).test(text);
  const rule = findMatchRule(variant);
  if (!rule && isSpacelessText(variant)) return text.replace(/\s+/g, '').includes(variant);
  const target = (rule?.excludes ?? []).reduce((current, excluded) => current.replaceAll(excluded, ' '), text);
  return rule?.wordStart ? new RegExp(WORD_START_PATTERN + escapeRegex(variant)).test(target) : target.includes(variant);
};

// 단어마다 제목·요약·본문·결과·키워드 중 한 곳에 있으면 되고(조사·끝말을 뗀 말·동의어도 인정), 모든 단어가 있어야 한다(AND).
// 단어가 서로 다른 필드에 있어도 된다. 예: "보증금 반환"은 "보증금을 반환하지 않아…"에도 걸린다.
// 경계 규칙을 Prisma 조건으로는 못 써서 SQL로 맞는 id를 먼저 찾고, 나머지(필터·개수·페이지)는 그 id로 거른다.
const findKeywordMatch = async (keyword) => {
  const conditions = Prisma.join(
    toSearchTerms(keyword).map((term) => Prisma.sql`(${toTermMatchSql(term)})`),
    ' AND ',
  );
  const rows = await prisma.$queryRaw`SELECT id FROM dispute_references WHERE ${conditions}`;
  return { id: { in: rows.map((row) => row.id) } };
};

// match: 검색어에 맞는 id 목록({ id: { in } }, 검색어·조건 완화). 없으면 null.
const buildWhere = ({ propertyKind, ...exactFilters }, match) => {
  const conditions = [exactFilters];
  // propertyKind가 null인 자료(FAQ 등)는 주택·상가 공통이라 어느 쪽으로 걸러도 함께 보여준다.
  if (propertyKind) conditions.push({ OR: [{ propertyKind }, { propertyKind: null }] });
  if (match) conditions.push(match);
  return { AND: conditions };
};

const toCounts = (values, groups, field) =>
  Object.fromEntries(values.map((value) => [value, groups.find((group) => group[field] === value)?._count._all ?? 0]));

// 관련도 점수: 단어가 어느 필드에 있는지에 따라 더한다(제목 > 요약·키워드 > 본문·결과).
// 비용 끝말을 뗀 말·동의어도 따로 더한다 — 같은 필드라면 "도배비"가 그대로 있는 자료가 "도배"로도 점수를 받아 "도배"만 있는 자료보다 앞선다.
// 입력한 말은 2배, 동의어는 1배로 더한다(toWeightedVariants).
// 단어가 둘 이상이고 검색어가 띄어 쓴 그대로(띄어쓰기 차이는 무시) 붙어 있으면 입력한 말과 같은 배율로 한 번 더 더한다.
const RELEVANCE_WEIGHTS = { title: 3, summary: 2, keywords: 2, caseNumber: 2, content: 1, outcome: 1 };

const ilikeScore = (column, text, weight) =>
  Prisma.sql`(CASE WHEN ${toColumnMatchSql(column, text)} THEN ${weight} ELSE 0 END)`;

// ── 점수 보정: 출현 횟수·제목 앞부분(조사 13절 #4·#6). 근접도(#5)는 buildRelevanceScore ──
// 경계 규칙·사건번호·조문인 말은 글자 그대로 세면 틀려서(장기수선충당금 속 "수선", "제6조의3" 속 "제6조") 보정하지 않는다.
const isPlainText = (text) => !findMatchRule(text) && !toLegalReferencePattern(text);

// 본문 출현 횟수: 1번이면 1배, 많을수록 로그로 늘어 TF_SATURATION_COUNT번 이상이면 2배(상한) — BM25의 tf 포화를 단순하게 한 것.
// 같은 말을 몇십 번 쓴 긴 판례가 제목에 있는 자료를 앞지르지 않게 상한을 둔다(본문 1점 → 많아야 2점, 제목은 3점).
// 글자 그대로 센다(replace) — 공백을 지우고 맞은 말("묵시적갱신" ↔ "묵시적 갱신")은 0번으로 세어지므로 최소 1번으로 본다.
const TF_SATURATION_COUNT = 5;

const contentScore = (text, weight) => {
  if (!isPlainText(text)) return ilikeScore('content', text, weight);
  const count = Prisma.sql`(char_length(content) - char_length(replace(content, ${text}, ''))) / ${[...text].length}`;
  return Prisma.sql`(CASE WHEN ${toColumnMatchSql('content', text)} THEN ${weight} * (1 + LEAST(ln(GREATEST(1, ${count})) / ln(${TF_SATURATION_COUNT}), 1)) ELSE 0 END)`;
};

// 제목 앞부분: 제목이 그 말로 시작하면 제목 점수의 TITLE_POSITION_FACTOR배를 더하고, 뒤로 갈수록 줄어 TITLE_POSITION_WINDOW글자째부터는 0.
// "권리금"이면 "권리금 회수기회 보호…"가 "…에 관한 권리금"보다 앞(Meilisearch wordPosition과 같은 생각).
// 띄어쓰기 없는 제목은 빼다: 판결요지가 없는 판례의 사건명(1,277건 — "보증금반환등", "관리비·건물인도등", "구상금")이라
// 짧고 검색어로 시작하기 쉬워 내용 있는 제목을 밀어냈다. 사례·가이드 제목에는 띄어쓰기 없는 것이 없다.
const TITLE_POSITION_FACTOR = 0.5;
const TITLE_POSITION_WINDOW = 20;

const titlePositionScore = (text, weight) => {
  if (!isPlainText(text)) return Prisma.sql`0`;
  return Prisma.sql`(CASE WHEN strpos(title, ${text}) > 0 AND title ~ '\\s' THEN ${weight} * GREATEST(0, 1 - (strpos(title, ${text}) - 1)::float / ${TITLE_POSITION_WINDOW}) ELSE 0 END)`;
};

// 단어(조사·동의어 포함) 점수에는 출현 횟수(withFrequency)를, 그중 입력한 말에는 제목 앞부분(withTitlePosition)도 더한다.
// 제목 앞부분을 동의어에도 주면 "세입자"로 찾을 때 제목이 "임차인…"으로 시작하는 자료가 요약에 "세입자"가 있는 자료를 앞지른다.
// 붙은 말 점수는 그대로.
const buildTextScore = (text, factor, { withFrequency = false, withTitlePosition = false } = {}) =>
  Prisma.join(
    [
      ilikeScore('title', text, RELEVANCE_WEIGHTS.title * factor),
      ilikeScore('summary', text, RELEVANCE_WEIGHTS.summary * factor),
      withFrequency
        ? contentScore(text, RELEVANCE_WEIGHTS.content * factor)
        : ilikeScore('content', text, RELEVANCE_WEIGHTS.content * factor),
      ilikeScore("coalesce(outcome, '')", text, RELEVANCE_WEIGHTS.outcome * factor),
      ilikeScore(CASE_NUMBER_COLUMN, text, RELEVANCE_WEIGHTS.caseNumber * factor),
      ...(withTitlePosition ? [titlePositionScore(text, RELEVANCE_WEIGHTS.title * factor * TITLE_POSITION_FACTOR)] : []),
    ],
    ' + ',
  );

const PHRASE_FACTOR = 2;

// 흔한 단어 가중치(BM25의 IDF): 자료 대부분에 있는 단어("임대인", "보증금")는 점수를 적게, 드문 단어("권리금", "곰팡이")는 많이 준다.
// 단어마다 걸리는 자료 수(df, 조사·끝말·동의어 포함 — 검색 조건과 같은 기준)를 세서 ln(1 + (N − df + 0.5) / (df + 0.5))를 곱한다.
// 자료가 7,941건이면 1,681건에 있는 "보증금"은 약 1.6, 19건에 있는 "곰팡이"는 약 6.0.
// 단어별 건수는 전체를 훑어야 해서(모든 단어를 한 번에 센다) 10분 동안 기억한다. 자료는 시드할 때만 바뀐다.
const TERM_STATS_TTL_MS = 10 * 60 * 1000;
const TERM_STATS_MAX_ENTRIES = 2000;
const termDocCounts = new Map(); // 단어 → { docCount, countedAt }
let totalDocCount = null; // { count, countedAt }

const isFresh = (entry, now) => entry && now - entry.countedAt < TERM_STATS_TTL_MS;

const countTermDocs = async (terms) => {
  const now = Date.now();
  const missing = terms.filter((term) => !isFresh(termDocCounts.get(term), now));
  if (missing.length === 0 && isFresh(totalDocCount, now)) return;

  const columns = [
    Prisma.sql`count(*)::int AS total`,
    ...missing.map((term, index) => Prisma.sql`(count(*) FILTER (WHERE ${toTermMatchSql(term)}))::int AS ${Prisma.raw(`t${index}`)}`),
  ];
  const [row] = await prisma.$queryRaw`SELECT ${Prisma.join(columns, ', ')} FROM dispute_references`;
  if (termDocCounts.size + missing.length > TERM_STATS_MAX_ENTRIES) termDocCounts.clear();
  totalDocCount = { count: row.total, countedAt: now };
  missing.forEach((term, index) => termDocCounts.set(term, { docCount: row[`t${index}`], countedAt: now }));
};

const toIdf = (docCount, total) => Math.log(1 + (total - docCount + 0.5) / (docCount + 0.5));

// 단어 → 가중치. 소수 셋째 자리까지만 쓴다(SQL 파라미터를 짧게).
const findTermWeights = async (terms) => {
  await countTermDocs(terms);
  const total = totalDocCount.count;
  return new Map(terms.map((term) => [term, Math.round(toIdf(termDocCounts.get(term).docCount, total) * 1000) / 1000]));
};

// 사건번호·조문이 정확히 맞는 자료는 다른 점수와 상관없이 맨 위(대법원 종합법률정보·국가법령정보센터처럼).
// 사건번호: 그 판례. 조문: 그 조문의 법령 원문(sourceKey law-…, 제목 "주택임대차보호법 제6조의3(계약갱신 요구 등)") —
// 법 이름을 같이 쓰면 그 법만("주택임대차보호법 제6조"에 시행령 제6조는 아님), 없으면 그 조문 번호의 모든 법령 —
// 이때는 법률 조문을 시행령 조문보다 앞에 둔다(SECONDARY_BONUS).
// 단어 점수(가중치×배율×필드, 많아야 수백)보다 훨씬 크게 — 둘 사이도 단어 점수로 뒤집히지 않게 벌려 둔다.
const EXACT_REFERENCE_BONUS = 10000;
const SECONDARY_REFERENCE_BONUS = 5000;

const toLawTitleSql = (pattern) => Prisma.sql`translate(title, ' ', '') ~ ${pattern}`;

// 맨 위에 둘 자료의 점수(CASE 식). 사건번호·조문이 없으면 null.
const buildExactReferenceScore = (keyword) => {
  const { caseNumbers, articles } = findLegalReferences(keyword);
  const titlePatterns = articles.map(toLawTitlePatterns);
  const primary = [
    ...caseNumbers.map((caseNumber) => Prisma.sql`${Prisma.raw(CASE_NUMBER_COLUMN)} ~ ${toLegalReferencePattern(caseNumber)}`),
    ...titlePatterns.map(({ primary: pattern }) => toLawTitleSql(pattern)),
  ];
  if (primary.length === 0) return null;
  const secondary = titlePatterns.filter(({ secondary: pattern }) => pattern).map(({ secondary: pattern }) => toLawTitleSql(pattern));
  return Prisma.sql`(CASE WHEN ${Prisma.join(primary, ' OR ')} THEN ${EXACT_REFERENCE_BONUS}${
    secondary.length > 0 ? Prisma.sql` WHEN ${Prisma.join(secondary, ' OR ')} THEN ${SECONDARY_REFERENCE_BONUS}` : Prisma.empty
  } ELSE 0 END)`;
};

// 근접도(조사 13절 #5): 검색어에서 이웃한 두 단어(조사를 뗀 말)가 PROXIMITY_WINDOW글자 안에 있으면 더한다.
// 붙은 말 점수(PHRASE_FACTOR)는 띄어 쓴 그대로일 때만 받아서 "보증금을 반환"·"반환할 보증금"은 못 받는다 — 그 사이를 메운다.
// 붙은 말 점수의 절반(PROXIMITY_FACTOR)으로, 같은 필드 가중치(제목 > 요약 > 본문)를 쓴다.
const PROXIMITY_FACTOR = 1;
const PROXIMITY_WINDOW = 15;
const PROXIMITY_COLUMNS = ['title', 'summary', 'content'];

const toProximityWord = (term) => stripParticle(term).at(-1);

const buildProximityScore = (terms, termWeights) =>
  terms.slice(1).flatMap((term, index) => {
    const previous = terms[index];
    const [a, b] = [toProximityWord(previous), toProximityWord(term)];
    if (a.length < MIN_STEM_LENGTH || b.length < MIN_STEM_LENGTH || a.includes(b) || b.includes(a)) return [];
    const near = `.{0,${PROXIMITY_WINDOW}}`;
    const pattern = `${escapeRegex(a)}${near}${escapeRegex(b)}|${escapeRegex(b)}${near}${escapeRegex(a)}`;
    const weight = ((termWeights.get(previous) + termWeights.get(term)) / 2) * PROXIMITY_FACTOR;
    return PROXIMITY_COLUMNS.map(
      (column) => Prisma.sql`(CASE WHEN ${Prisma.raw(column)} ~* ${pattern} THEN ${RELEVANCE_WEIGHTS[column] * weight} ELSE 0 END)`,
    );
  });

// 자료 종류 가산(조사 13절 #12, 11-12 사용자 결정 "쉬운 자료 우대"): 조정 사례·가이드(상담·법령)는 단어 점수 합에 1.2배, 판례는 1배.
// 판례가 7,365건(93%)이라 상위를 판례가 채우기 쉬운데, 임대인에게는 사례·상담이 읽기 쉽다. 배율이 작아서 관련도가 크게 높은
// 판례는 그대로 위에 남는다(판례 15점 > 사례 9점 × 1.2). 사건번호·조문 정확 일치 점수에는 곱하지 않는다(그건 종류와 상관없이 맨 위).
const EASY_TYPE_FACTOR = 1.2;
const TYPE_FACTOR_SQL = Prisma.sql`(CASE WHEN type = 'PRECEDENT' THEN 1 ELSE ${EASY_TYPE_FACTOR} END)`;

// 단어별 점수 × 그 단어의 가중치. 띄어 쓴 그대로 붙어 있을 때 점수는 단어 가중치의 평균을 곱한다.
const buildRelevanceScore = (keyword, termWeights) => {
  const terms = toSearchTerms(keyword);
  const scores = terms.flatMap((term) => {
    const weight = termWeights.get(term);
    return toWeightedVariants(term).map(
      ({ text, factor }) =>
        Prisma.sql`${buildTextScore(text, factor * weight, { withFrequency: true, withTitlePosition: factor === TYPED_FACTOR })} + (CASE WHEN ${toKeywordMatchSql(text)} THEN ${RELEVANCE_WEIGHTS.keywords * factor * weight} ELSE 0 END)`,
    );
  });
  if (terms.length > 1) {
    const averageWeight = terms.reduce((sum, term) => sum + termWeights.get(term), 0) / terms.length;
    // 붙여 쓴 말이 네 글자 이상이면 공백을 지우고 비교한다 — "묵시적 갱신"으로 찾아도 "묵시적갱신"이 쓰인 자료가 이 점수를 받는다.
    const joined = terms.join('');
    scores.push(buildTextScore(isSpacelessText(joined) ? joined : terms.join(' '), PHRASE_FACTOR * averageWeight));
    scores.push(...buildProximityScore(terms, termWeights));
  }
  const textScore = Prisma.sql`(${Prisma.join(scores, ' + ')}) * ${TYPE_FACTOR_SQL}`;
  const exactReference = buildExactReferenceScore(keyword);
  return exactReference ? Prisma.sql`${textScore} + ${exactReference}` : textScore;
};

// 검색 조건에 맞는 id 중 한 페이지를 점수 순으로 고른다. 점수가 같으면 id 순서로 페이지마다 순서를 고정한다.
// matchedCountById(조건 완화 때만): 들어 있는 검색어 단어 수를 점수보다 먼저 본다(단어를 많이 포함한 자료가 앞).
// 흔한 단어 가중치는 그 안에서만 쓴다 — 드문 말이 우연히 맞은 자료가 단어를 더 많이 포함한 자료를 앞지르지 않게.
const findPageIdsByRelevance = async (ids, keyword, direction, page, size, matchedCountById) => {
  if (ids.length === 0) return [];
  const order = direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const relevanceScore = buildRelevanceScore(keyword, await findTermWeights(toSearchTerms(keyword)));
  const rows = matchedCountById
    ? await prisma.$queryRaw`
        SELECT id FROM dispute_references
        JOIN unnest(${ids}::uuid[], ${ids.map((id) => matchedCountById.get(id))}::int[]) AS counted(id, matched) USING (id)
        ORDER BY counted.matched ${order}, ${relevanceScore} ${order}, id ASC
        LIMIT ${size} OFFSET ${(page - 1) * size}`
    : await prisma.$queryRaw`
        SELECT id FROM dispute_references
        WHERE id = ANY(${ids}::uuid[])
        ORDER BY ${relevanceScore} ${order}, id ASC
        LIMIT ${size} OFFSET ${(page - 1) * size}`;
  return rows.map((row) => row.id);
};

const findReferencePageByRelevance = async (matchedIds, keyword, { direction }, page, size, matchedCountById) => {
  const pageIds = await findPageIdsByRelevance(matchedIds, keyword, direction, page, size, matchedCountById);
  const items = await prisma.disputeReference.findMany({ where: { id: { in: pageIds } }, select: LIST_SELECT });
  return pageIds.map((id) => toListItem(items.find((item) => item.id === id)));
};

// 조건 완화: 띄어 쓴 단어가 모두 들어간 자료가 하나도 없을 때(종류·상황 필터 전 기준), 단어가 하나라도 들어간 자료를
// 단어를 많이 포함한 순 → 관련도 순으로 보여 준다(Algolia optionalWords·words 규칙과 같은 방식).
// 가장 많이 맞은 자료만 남기면 "곰팡이 냄새 원룸"에서 곰팡이·원룸이 우연히 함께 나온 1건만 남고 곰팡이 사례 19건이 빠져서 모두 보여 준다.
// 단어를 하나씩 빼며 다시 찾는 대신(단어 조합마다 전체를 훑어야 함) 한 번 훑으면서 자료마다 들어 있는 단어 수를 센다.
// 한 글자 단어("안", "꼭", "집")는 거의 모든 자료에 글자로 들어 있어 셀 때 뺀다.
const findPartialMatchIds = async (propertyKind, terms) => {
  const matchedCount = Prisma.join(
    terms.map((term) => Prisma.sql`(CASE WHEN ${toTermMatchSql(term)} THEN 1 ELSE 0 END)`),
    ' + ',
  );
  const propertyKindSql = propertyKind
    ? Prisma.sql`WHERE property_kind::text = ${propertyKind} OR property_kind IS NULL`
    : Prisma.empty;
  const rows = await prisma.$queryRaw`
    SELECT id, matched FROM (SELECT id, (${matchedCount})::int AS matched FROM dispute_references ${propertyKindSql}) counted
    WHERE matched > 0`;
  return {
    matchedCountById: new Map(rows.map((row) => [row.id, row.matched])),
    matchedTermCount: rows.reduce((best, row) => Math.max(best, row.matched), 0),
  };
};

// 검색 조건(match)에 맞는 한 페이지와 화면 숫자. scoreKeyword는 관련도 점수를 매길 검색어.
// matchedCountById(조건 완화 때만)가 있으면 관련도 순에서 단어 수를 먼저 본다.
const searchReferences = async ({ filters, match, scoreKeyword, page, size, orderBy, matchedCountById }) => {
  const where = buildWhere(filters, match);
  const { type: _type, category, ...baseFilters } = filters;
  // 관련도 순이면 조건에 맞는 id만 먼저 받고, 점수 계산·페이지 자르기는 SQL로 한다.
  const byRelevance = orderBy.field === RELEVANCE_SORT_FIELD;

  // 화면 숫자용 개수. 종류 탭(countsByType)은 고른 종류만 빼고, 상황 타일(countsByCategory)은
  // 종류·유형을 둘 다 빼고 같은 검색 조건으로 센다.
  const [found, total, typeGroups, categoryGroups] = await prisma.$transaction([
    byRelevance
      ? prisma.disputeReference.findMany({ where, select: { id: true } })
      : prisma.disputeReference.findMany({
          where,
          select: LIST_SELECT,
          orderBy: buildOrderBy(orderBy),
          skip: (page - 1) * size,
          take: size,
        }),
    prisma.disputeReference.count({ where }),
    prisma.disputeReference.groupBy({
      by: ['type'],
      where: buildWhere(category ? { ...baseFilters, category } : baseFilters, match),
      _count: { _all: true },
      orderBy: { type: 'asc' },
    }),
    prisma.disputeReference.groupBy({
      by: ['category'],
      where: buildWhere(baseFilters, match),
      _count: { _all: true },
      orderBy: { category: 'asc' },
    }),
  ]);

  const items = byRelevance
    ? await findReferencePageByRelevance(
        found.map((reference) => reference.id),
        scoreKeyword,
        orderBy,
        page,
        size,
        matchedCountById,
      )
    : found.map(toListItem);

  return {
    items,
    meta: {
      page,
      size,
      total,
      hasNext: page * size < total,
      countsByType: toCounts(Object.values(DisputeReferenceType), typeGroups, 'type'),
      countsByCategory: toCounts(Object.values(DisputeCategory), categoryGroups, 'category'),
    },
    // 종류·상황 필터 전 기준으로 검색어에 맞는 자료가 있는지(조건 완화 판단용)
    hasAnyMatch: categoryGroups.length > 0,
  };
};

// meta.partialMatch: 조건을 완화했으면 { matchedTermCount, termCount }(띄어 쓴 단어 termCount개 중 가장 많이 들어간 자료의 단어 수), 아니면 null.
// ── 오타 제안 ──
// 검색어 단어 중 걸리는 자료가 0건인 단어(조사·끝말·동의어로도 없음)를 자료에 있는 가장 가까운 낱말로 바꿔 제안한다.
// 낱말 사전은 제목·요약·키워드의 낱말(조사를 뗀 말, 두 글자 이상)로 만들고, 우연한 오자를 빼려고 두 건 이상에 나온 말만 쓴다.
// 비교는 한글 자모 편집 거리(searchSuggestion.js). 사전은 단어별 건수처럼 10분 동안 기억한다.
const VOCABULARY_MIN_DOCS = 2;
const VOCABULARY_MAX_LENGTH = 8;
let vocabularyCache = null; // { entries, countedAt }

const toVocabularyWord = (token) => stripParticle(token).at(-1);

const loadVocabulary = async () => {
  const now = Date.now();
  if (isFresh(vocabularyCache, now)) return vocabularyCache.entries;

  const rows = await prisma.disputeReference.findMany({ select: { title: true, summary: true, keywords: true } });
  const docCounts = new Map();
  for (const row of rows) {
    const words = new Set(
      `${row.title} ${row.summary} ${row.keywords.join(' ')}`
        .split(/[^가-힣]+/)
        .filter(Boolean)
        .map(toVocabularyWord)
        .filter((word) => word.length >= MIN_STEM_LENGTH && word.length <= VOCABULARY_MAX_LENGTH),
    );
    for (const word of words) docCounts.set(word, (docCounts.get(word) ?? 0) + 1);
  }
  const entries = [...docCounts]
    .filter(([, docCount]) => docCount >= VOCABULARY_MIN_DOCS)
    .map(([word, docCount]) => ({ word, jamo: toJamo(word), docCount }));
  vocabularyCache = { entries, countedAt: now };
  return entries;
};

// 오타로 보는 단어: 걸리는 자료가 0건이거나, RARE_TERM_DOCS건 미만인데 가까운 말이 RARE_TERM_RATIO배 이상 많이 쓰일 때
// (자료 속 오자 때문에 0건이 아닌 말 — "윌세" 1건, "게약" 3건 — 도 고칠 수 있게. Google "다음 검색결과 표시"와 같은 생각).
const RARE_TERM_DOCS = 5;
const RARE_TERM_RATIO = 20;

// ── 붙여 쓴 말 띄어 쓰기 제안 ──
// 붙여 쓴 말은 붙어 있는 자료만 찾는다(띄어쓰기 흡수). 띄어 쓰면 두 낱말이 떨어져 있어도 찾아서 훨씬 많이 나오는 경우가 있다 —
// "전세사기" 0건 / "전세 사기" 22건, "월세연체" 3건 / "월세 연체" 222건. 자동으로 쪼개면 결과가 엉뚱하게 넓어질 수 있어 제안만 한다.
// 두 조각이 모두 낱말 사전에 있는 말(두 글자 이상)이고, 띄어 쓴 쪽이 RARE_TERM_DOCS건 이상이면서 붙여 쓴 쪽의 SPLIT_RATIO배 이상일 때.
const SPLIT_RATIO = 5;

// 모든 단어가 들어 있는 자료 수(검색 조건과 같은 기준)
const countAllTermsDocs = async (terms) => {
  const conditions = Prisma.join(terms.map((term) => Prisma.sql`(${toTermMatchSql(term)})`), ' AND ');
  const [row] = await prisma.$queryRaw`SELECT count(*)::int AS count FROM dispute_references WHERE ${conditions}`;
  return row.count;
};

// "전세사기" → "전세 사기"(조사는 뒤 조각에 그대로: "전세사기를" → "전세 사기를"). 나눌 데가 없거나 많아지지 않으면 null.
const findSpacedSplit = async (term, docCount, vocabulary) => {
  const stem = toVocabularyWord(term);
  if (!isSpacelessText(stem) || !/^[가-힣]+$/.test(stem)) return null;
  const words = new Set(vocabulary.map((entry) => entry.word));
  const chars = [...stem];
  let best = null;
  for (let index = MIN_STEM_LENGTH; index <= chars.length - MIN_STEM_LENGTH; index += 1) {
    const left = chars.slice(0, index).join('');
    const right = chars.slice(index).join('');
    if (!words.has(left) || !words.has(right)) continue;
    const parts = [left, right + term.slice(stem.length)];
    const count = await countAllTermsDocs(parts);
    if (!best || count > best.count) best = { parts, count };
  }
  if (!best || best.count < Math.max(RARE_TERM_DOCS, docCount * SPLIT_RATIO)) return null;
  return best.parts.join(' ');
};

// 한/영 전환으로 바꾼 말("qhwmdrma"→"보증금")을 고쳐 줄 말. 한글로 친 오타와 같은 규칙을 쓴다 —
// 바꾼 말이 자료에 RARE_TERM_DOCS건 이상 있으면 그대로, 드물거나 없는데 가까운 말이 훨씬 많이 쓰이면 그 말("관지비"→"관리비"),
// 그것도 아니면 한 건이라도 있을 때만 그대로. 아무것도 없으면 null.
const correctConvertedWord = async (hangul, vocabulary) => {
  await countTermDocs([hangul]);
  const { docCount } = termDocCounts.get(hangul);
  if (docCount >= RARE_TERM_DOCS) return hangul;
  const stem = toVocabularyWord(hangul);
  const closest = findClosestWord(stem, vocabulary);
  if (closest && (docCount === 0 || closest.docCount >= docCount * RARE_TERM_RATIO)) return closest.word + hangul.slice(stem.length);
  return docCount > 0 ? hangul : findSpacedSplit(hangul, docCount, vocabulary);
};

// 제안 문구에 넣을 단어. 고친 단어는 고친 말로, 한/영 전환으로 친 불용어("tlvdjdy"→"싶어요")는 검색에서 빠지는 말이라
// 고칠 대상(corrections)에는 없지만 문구에 영문이 남지 않게 한글로 바꿔 둔다.
const toSuggestedWord = (word, corrections) => {
  if (corrections.has(word)) return corrections.get(word);
  const hangul = latinToHangul(word);
  return hangul && isStopWord(hangul) ? hangul : word;
};

// { query: 고친 검색어 전체, corrections: [{ from, to }] } 또는 null. 조사는 고친 말 뒤에 그대로 붙인다("보증굼을" → "보증금을").
// 불용어("싶어요")는 고치지 않고 검색어에 그대로 둔다.
const buildSuggestion = async (keyword) => {
  const terms = toSearchTerms(keyword);
  await countTermDocs(terms);
  const candidates = terms.filter((term) => termDocCounts.get(term).docCount < RARE_TERM_DOCS);
  if (candidates.length === 0) return null;

  const vocabulary = await loadVocabulary();
  const corrections = new Map();
  for (const term of candidates) {
    const docCount = termDocCounts.get(term).docCount;
    const hangul = latinToHangul(term);
    if (hangul) {
      // 한/영 전환 오타: 영문 그대로는 한 건도 없을 때만 본다(영문 약어 "LH"·"HUG"처럼 자료에 있는 말은 그대로 둔다)
      const fixed = docCount === 0 ? await correctConvertedWord(hangul, vocabulary) : null;
      if (fixed) corrections.set(term, fixed);
      continue;
    }
    // 붙여 쓴 말을 먼저 본다 — "전세사기"가 거리 2인 다른 낱말로 고쳐지지 않게
    const spaced = await findSpacedSplit(term, docCount, vocabulary);
    if (spaced) {
      corrections.set(term, spaced);
      continue;
    }
    const stem = toVocabularyWord(term);
    const closest = findClosestWord(stem, vocabulary);
    if (closest && (docCount === 0 || closest.docCount >= docCount * RARE_TERM_RATIO)) {
      corrections.set(term, closest.word + term.slice(stem.length));
    }
  }
  if (corrections.size === 0) return null;

  return {
    query: keyword
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => toSuggestedWord(word, corrections))
      .join(' '),
    corrections: [...corrections].map(([from, to]) => ({ from, to })),
  };
};

// meta.suggestion: 오타로 보이는 단어가 있으면 { query, corrections }, 아니면 null. 결과는 고치지 않은 검색어 그대로다(제안만).
export const findReferences = async ({ filters, keyword, page, size, orderBy }) => {
  const result = await findReferencesByKeyword({ filters, keyword, page, size, orderBy });
  const suggestion = keyword ? await buildSuggestion(keyword) : null;
  return { items: result.items, meta: { ...result.meta, suggestion } };
};

const findReferencesByKeyword = async ({ filters, keyword, page, size, orderBy }) => {
  const query = { filters, page, size, orderBy };
  const exact = await searchReferences({ ...query, match: keyword ? await findKeywordMatch(keyword) : null, scoreKeyword: keyword });
  const terms = keyword ? toSearchTerms(keyword) : [];
  const countedTerms = terms.filter((term) => term.length >= MIN_STEM_LENGTH);

  if (exact.hasAnyMatch || terms.length < 2 || countedTerms.length === 0) {
    return { items: exact.items, meta: { ...exact.meta, partialMatch: null } };
  }

  const { matchedCountById, matchedTermCount } = await findPartialMatchIds(filters.propertyKind, countedTerms);
  if (matchedTermCount === 0) return { items: exact.items, meta: { ...exact.meta, partialMatch: null } };

  const relaxed = await searchReferences({
    ...query,
    match: { id: { in: [...matchedCountById.keys()] } },
    scoreKeyword: countedTerms.join(' '),
    matchedCountById,
  });
  return { items: relaxed.items, meta: { ...relaxed.meta, partialMatch: { matchedTermCount, termCount: terms.length } } };
};

export const findReferenceById = async (referenceId) => {
  const found = await prisma.disputeReference.findUnique({ where: { id: referenceId } });
  if (!found) return null;

  // 임베딩은 챗봇 검색 내부용이라 응답에 넣지 않는다.
  const { embedding: _embedding, ...reference } = found;
  return {
    ...reference,
    sourceUrl: toSourceUrl(reference),
    createdAt: reference.createdAt.toISOString(),
    updatedAt: reference.updatedAt.toISOString(),
  };
};

// 자주 묻는 질문의 근거 자료(sourceKey → 요약). faqs.js가 쓴다.
export const findReferenceSummariesBySourceKeys = async (sourceKeys) => {
  if (sourceKeys.length === 0) return new Map();
  const references = await prisma.disputeReference.findMany({
    where: { sourceKey: { in: sourceKeys } },
    select: { sourceKey: true, id: true, type: true, category: true, title: true },
  });
  return new Map(references.map(({ sourceKey, ...reference }) => [sourceKey, reference]));
};

// 관련 자료를 고를 때 쓰는 기준 자료의 임베딩과 분쟁 유형. 없는 자료면 null.
// embedding 컬럼이 pgvector 타입이라 Prisma Client로 읽지 못해서 SQL로 숫자 배열로 바꿔 읽는다.
// 임베딩이 없으면(embed:disputes 실행 전) 예전과 같이 빈 배열이다.
export const findReferenceForRelated = async (referenceId) => {
  const reference = await prisma.disputeReference.findUnique({
    where: { id: referenceId },
    select: { id: true, category: true },
  });
  if (!reference) return null;

  const [row] = await prisma.$queryRaw`
    SELECT embedding::real[] AS embedding FROM dispute_references WHERE id = ${referenceId}::uuid
  `;
  return { ...reference, embedding: row?.embedding ?? [] };
};

// 관련 자료 후보(기준 자료 제외). 목록과 같은 필드에 유사도 계산용 임베딩을 더한다.
// 임베딩은 위와 같은 이유로 SQL로 읽어서 붙인다.
export const findRelatedCandidates = async (excludeId) => {
  const embeddings = await prisma.$queryRaw`
    SELECT id, embedding::real[] AS embedding
    FROM dispute_references
    WHERE id <> ${excludeId}::uuid AND embedding IS NOT NULL
  `;
  const embeddingById = new Map(embeddings.map(({ id, embedding }) => [id, embedding]));
  const candidates = await prisma.disputeReference.findMany({
    where: { id: { in: [...embeddingById.keys()] } },
    select: LIST_SELECT,
  });
  return candidates.map((candidate) => toListItem({ ...candidate, embedding: embeddingById.get(candidate.id) }));
};

// 임베딩이 아직 없을 때(embed:disputes 실행 전) 쓰는 대체: 같은 분쟁 유형의 최근 자료.
export const findSameCategoryReferences = async ({ excludeId, category, limit }) => {
  const references = await prisma.disputeReference.findMany({
    where: { id: { not: excludeId }, category },
    select: LIST_SELECT,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: limit,
  });
  return references.map(toListItem);
};

// ===== 분쟁 상담 챗봇 =====

// 한 대화에 쌓을 수 있는 메시지 수(질문+답변). 대화가 길수록 요청마다 보내는 이력과 비용이 커진다.
export const MAX_CHAT_MESSAGES = 40;
const CHAT_TITLE_LENGTH = 50;

const REFERENCE_SUMMARY_SELECT = { id: true, type: true, title: true, sourceTitle: true, sourcePage: true };

// 질문 임베딩과 가까운 자료를 유사도 높은 순서로 limit건(similarity는 코사인 유사도).
// 임베딩이 아직 없는 자료(embed:disputes 실행 전)는 뺀다.
export const findReferencesForRetrieval = async (queryEmbedding, limit) => {
  const vector = `[${queryEmbedding}]`;
  const nearest = await prisma.$queryRaw`
    SELECT id, 1 - (embedding <=> ${vector}::vector) AS similarity
    FROM dispute_references
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${vector}::vector
    LIMIT ${limit}
  `;
  const references = await prisma.disputeReference.findMany({
    where: { id: { in: nearest.map(({ id }) => id) } },
    select: {
      id: true,
      type: true,
      propertyKind: true,
      title: true,
      content: true,
      outcome: true,
      caseNumber: true,
      relatedLaws: true,
      sourceTitle: true,
      sourcePage: true,
    },
  });
  const byId = new Map(references.map((reference) => [reference.id, reference]));
  return nearest.map(({ id, similarity }) => ({ ...byId.get(id), similarity }));
};

const toChatSummary = (chat) => ({
  id: chat.id,
  title: chat.title,
  createdAt: chat.createdAt.toISOString(),
  updatedAt: chat.updatedAt.toISOString(),
});

// referenceIds 순서([1], [2] 번호)를 그대로 지켜서 references를 붙인다.
const toChatMessage = (message, referencesById) => ({
  id: message.id,
  role: message.role,
  content: message.content,
  references: message.referenceIds.map((id) => referencesById.get(id)).filter(Boolean),
  createdAt: message.createdAt.toISOString(),
});

const findReferenceSummaries = async (ids) => {
  if (ids.length === 0) return new Map();
  const references = await prisma.disputeReference.findMany({
    where: { id: { in: ids } },
    select: REFERENCE_SUMMARY_SELECT,
  });
  return new Map(references.map((reference) => [reference.id, reference]));
};

export const findChats = async ({ userId, page, size }) => {
  const where = { userId };
  const [chats, total] = await prisma.$transaction([
    prisma.disputeChat.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.disputeChat.count({ where }),
  ]);

  return {
    items: chats.map(toChatSummary),
    meta: { page, size, total, hasNext: page * size < total },
  };
};

// 다른 사용자의 대화는 없는 것과 똑같이 null을 돌려준다(호출부가 404로 응답).
export const findChatWithMessages = async ({ chatId, userId }) => {
  const chat = await prisma.disputeChat.findFirst({
    where: { id: chatId, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!chat) return null;

  const referencesById = await findReferenceSummaries([...new Set(chat.messages.flatMap((m) => m.referenceIds))]);
  return {
    ...toChatSummary(chat),
    messages: chat.messages.map((message) => toChatMessage(message, referencesById)),
  };
};

// 이어서 질문할 때 Claude에 보낼 이전 대화. 다른 사용자의 대화면 null.
export const findChatHistory = async ({ chatId, userId }) => {
  const chat = await prisma.disputeChat.findFirst({
    where: { id: chatId, userId },
    select: { id: true, messages: { select: { role: true, content: true }, orderBy: { createdAt: 'asc' } } },
  });
  return chat?.messages ?? null;
};

// 질문과 답변을 함께 저장한다. 같은 트랜잭션 안의 now()는 값이 같아서 순서가 섞이므로
// createdAt을 직접 넣는다(질문 시각 < 답변 시각).
const toMessageRows = ({ question, questionAt, answer, answerAt }) => [
  { role: 'USER', content: question, referenceIds: [], createdAt: questionAt },
  {
    role: 'ASSISTANT',
    content: answer.content,
    referenceIds: answer.referenceIds,
    inputTokens: answer.inputTokens,
    outputTokens: answer.outputTokens,
    createdAt: answerAt,
  },
];

const toSavedMessages = async (messages) => {
  const referencesById = await findReferenceSummaries(messages.flatMap((m) => m.referenceIds));
  return messages.map((message) => toChatMessage(message, referencesById));
};

export const createChat = async ({ userId, question, questionAt, answer, answerAt }) => {
  const chat = await prisma.disputeChat.create({
    data: {
      userId,
      title: question.slice(0, CHAT_TITLE_LENGTH),
      messages: { create: toMessageRows({ question, questionAt, answer, answerAt }) },
    },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });

  return { ...toChatSummary(chat), messages: await toSavedMessages(chat.messages) };
};

export const appendChatMessages = async ({ chatId, question, questionAt, answer, answerAt }) => {
  const rows = toMessageRows({ question, questionAt, answer, answerAt });
  const messages = await prisma.$transaction([
    ...rows.map((row) => prisma.disputeChatMessage.create({ data: { ...row, chatId } })),
    // 목록을 최근 대화순으로 보여주기 위해 updatedAt을 갱신한다.
    prisma.disputeChat.update({ where: { id: chatId }, data: { updatedAt: answerAt } }),
  ]);

  return toSavedMessages(messages.slice(0, rows.length));
};

// 지운 건수를 돌려준다. 0이면 없거나 다른 사용자의 대화다.
export const deleteChat = async ({ chatId, userId }) => {
  const { count } = await prisma.disputeChat.deleteMany({ where: { id: chatId, userId } });
  return count;
};
