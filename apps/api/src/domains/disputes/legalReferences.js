// 사건번호("2020다226452")·조문("주택임대차보호법 제6조의3") 검색. DB를 쓰지 않는 순수 함수만 둔다(검색 조건·점수는 service.js).
// 대법원 종합법률정보·국가법령정보센터처럼 사건번호·조문은 글자가 정확히 맞는 자료를 맨 위에 둔다.
// 그냥 포함 검색이면 "2020다22645"가 "2020다226452"에, "제6조"가 "제6조의3"에 걸려서 경계를 지켜 찾는다.

// 사건 부호(법원 사건별 부호 중 자료에 나오는 것과 흔한 것). 목록에 있는 부호만 사건번호로 본다 —
// "2023년 5월"처럼 숫자·한글·숫자인 말을 사건번호로 오인하지 않게. 긴 부호를 먼저 본다("다카"가 "다"보다 앞).
const CASE_CODES = [
  '다카', '가합', '가단', '가소', '구합', '구단', '카합', '카단', '타경', '고합', '고단', '재다',
  '다', '나', '누', '두', '구', '마', '머', '그', '카', '라', '도', '노', '므', '르', '스', '드', '느', '후', '허',
];
const CASE_CODE_PATTERN = CASE_CODES.join('|');
// 연도(두 자리·네 자리) + 부호 + 번호. 앞뒤가 숫자가 아니어야 한다.
const CASE_NUMBER_IN_TEXT = new RegExp(`(?<![0-9])((?:[0-9]{2}|[0-9]{4}))\\s*(${CASE_CODE_PATTERN})\\s*([0-9]{1,7})(?![0-9])`, 'g');
const CASE_NUMBER_TEXT = new RegExp(`^(?:[0-9]{2}|[0-9]{4})(?:${CASE_CODE_PATTERN})[0-9]{1,7}$`);

// 조문: "제6조", "제6조의3". 띄어 쓴 것("제 6 조의 3")·"제"를 뺀 것("6조의3")도 받는다.
// "제"가 없는 "6조"만은 바꾸지 않는다("6조 원" 같은 금액일 수 있어서).
const ARTICLE_WITH_JE = /제\s*([0-9]+)\s*조(?:\s*의\s*([0-9]+)(?![0-9]))?/g;
const ARTICLE_WITHOUT_JE = /(?<![0-9제])([0-9]+)\s*조\s*의\s*([0-9]+)(?![0-9])/g;
const ARTICLE_TEXT = /^제[0-9]+조(?:의[0-9]+)?$/;

const toArticle = (main, sub) => (sub ? `제${main}조의${sub}` : `제${main}조`);

// 법 이름 뒤의 "640조"(제·의 없음)는 조문으로 본다("민법 640조" → "민법 제640조"). 법 이름이 없으면 금액일 수 있어 그대로 둔다.
const PLAIN_ARTICLE = /(?<![0-9제])([0-9]+)\s*조(?![0-9]|\s*원)/g;

// 검색어 속 사건번호·조문을 한 가지 모양으로 붙여 쓴다. "2020다 226452" → "2020다226452", "6조의 3" → "제6조의3".
export const normalizeLegalReferences = (keyword) => {
  const normalized = keyword
    .replace(CASE_NUMBER_IN_TEXT, (_, year, code, serial) => `${year}${code}${serial}`)
    .replace(ARTICLE_WITH_JE, (_, main, sub) => toArticle(main, sub))
    .replace(ARTICLE_WITHOUT_JE, (_, main, sub) => toArticle(main, sub));
  return findLawNames(normalized).size > 0 ? normalized.replace(PLAIN_ARTICLE, (_, main) => toArticle(main)) : normalized;
};

export const isCaseNumberText = (text) => CASE_NUMBER_TEXT.test(text);
export const isArticleText = (text) => ARTICLE_TEXT.test(text);

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 자료에서 찾을 때 쓰는 정규식(PostgreSQL ~ 과 JS RegExp 둘 다 되는 문법). 사건번호·조문이 아니면 null.
// 사건번호: 앞뒤가 숫자가 아니어야 한다. 조문: "제6조의3" 뒤에 숫자가 오면 안 되고("제6조의30"),
// "제6조" 뒤에 "의+숫자"가 오면 안 된다("제6조의3"). "제6조의 규정"(조사 '의')은 걸린다.
export const toLegalReferencePattern = (text) => {
  if (isCaseNumberText(text)) return `(^|[^0-9])${escapeRegex(text)}([^0-9]|$)`;
  if (isArticleText(text)) return `${escapeRegex(text)}${text.includes('의') ? '(?![0-9])' : '(?!의[0-9])'}`;
  return null;
};

// 법령 자료(sourceKey law-…)의 제목은 "주택임대차보호법 제6조의3(계약갱신 요구 등)". 공백을 지운 법 이름으로 맞춘다.
// 약칭은 정식 이름으로 본다. 긴 이름을 먼저 본다("주택임대차보호법시행령"이 "주택임대차보호법"보다 앞).
const LAW_NAMES = [
  ['상가건물임대차보호법시행령', '상가건물임대차보호법시행령'],
  ['주택임대차보호법시행령', '주택임대차보호법시행령'],
  ['상가건물임대차보호법', '상가건물임대차보호법'],
  ['상가임대차보호법', '상가건물임대차보호법'],
  ['상가임대차법', '상가건물임대차보호법'],
  ['주택임대차보호법', '주택임대차보호법'],
  ['주택임대차법', '주택임대차보호법'],
  ['상임법', '상가건물임대차보호법'],
  ['주임법', '주택임대차보호법'],
  ['민법', '민법'],
];

const STATUTES = ['민법', '주택임대차보호법', '상가건물임대차보호법'];
const DECREES = ['주택임대차보호법시행령', '상가건물임대차보호법시행령'];

// 조문 원문(법령 자료)의 제목(공백 지움)을 맞추는 정규식. 제목은 "주택임대차보호법 제6조의3(계약갱신 요구 등)" 모양이라
// 알려진 법 이름 + 조문 + "("로 시작하는지 본다 — 판례 제목 속 "…법 제6조의3 제1항…"은 안 걸린다.
// 법 이름이 있으면 그 법만, 없으면 법률(primary)을 시행령(secondary)보다 앞에 둔다.
export const toLawTitlePatterns = ({ law, article }) => {
  const pattern = (names) => `^(${names.join('|')})${article}\\(`;
  return law ? { primary: pattern([law]), secondary: null } : { primary: pattern(STATUTES), secondary: pattern(DECREES) };
};

// 검색어(공백 지움)에 든 법 이름(정식 이름, 공백 없음). 긴 이름부터 맞추고 맞춘 부분은 지운다("주택임대차보호법시행령" 속 "주택임대차보호법"은 따로 안 셈).
function findLawNames(keyword) {
  let rest = keyword.replace(/\s+/g, '');
  const laws = new Set();
  for (const [name, law] of LAW_NAMES) {
    if (rest.includes(name)) {
      laws.add(law);
      rest = rest.replaceAll(name, ' ');
    }
  }
  return laws;
}

// 맨 위에 둘 자료: { caseNumbers: ['2020다226452'], articles: [{ law: '주택임대차보호법' | null, article: '제6조의3' }] }.
// 법 이름은 하나만 있을 때만 조문에 붙인다(둘 이상이면 어느 법인지 몰라 이름 없이).
export const findLegalReferences = (keyword) => {
  const normalized = normalizeLegalReferences(keyword);
  const words = normalized.split(/\s+/).filter(Boolean);
  const caseNumbers = [...new Set(words.filter(isCaseNumberText))];
  const articleWords = [...new Set(words.map((word) => word.match(/^제[0-9]+조(?:의[0-9]+)?/)?.[0]).filter(Boolean))];
  const laws = findLawNames(normalized);
  const law = laws.size === 1 ? [...laws][0] : null;
  return { caseNumbers, articles: articleWords.map((article) => ({ law, article })) };
};
