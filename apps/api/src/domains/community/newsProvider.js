// 뉴스 공급자 — 구글 뉴스 RSS 검색 크롤링(팀 결정). 커뮤니티에서 외부를 부르는 곳은 이 파일 하나뿐이고
// 실거래가 등 다른 외부 API 는 부르지 않는다. 다른 사이트는 긁지 않는다. 다른 파일은 fetchNews() 모양만 안다.
//
//   fetchNews({ scope: 'SIGUNGU', sigunguQueryName: '송파', dongQueryNames: ['잠실'] }, { deadline }) → { articles, skippedQueries }
//   fetchNews({ scope: 'SIDO', sidoNames: ['서울'] }, { deadline })        → { articles, skippedQueries }
//   fetchNews({ scope: 'NATIONWIDE' }, { deadline })                   → { articles, skippedQueries }
//   fetchNews({ scope: 'COMPLEX', complexQueryNames: ['잠실엘스아파트', '잠실엘스'] }, { deadline }) → { articles, skippedQueries }
//   걸러내기(부동산 낱말·지역 이름)는 newsRelevance.js — 수집하는 쪽이 저장 전에 한다.
//   articles: [{ title, url, source, publishedAt }] — 제목(꼬리 " - 언론사" 뗀 것)·구글 경유 링크·언론사·Date.
//   description 은 꺼내지 않는다. 받기에 실패하면 빈 결과다 — 개발·배포 모두 가짜 기사로 채우지 않는다.
//   deadline(밀리초 시각)을 넘길 것 같으면 남은 검색어는 부르지 않고 skippedQueries 로 돌려준다(다음 실행 때 다시).
//
// ⚠️ 구글 뉴스 RSS 의 이용 조건은 개인적·비상업적 이용이고 공식 API 가 아니다 — 학기 데모용. 실서비스 전에
//    출처를 다시 정한다. 바꿀 때는 이 파일만 교체한다.

// 검색어 · 기간 · 건수 · 요청 한도 같은 값은 모두 newsRules.js 에 있다(이 파일은 읽기만 한다).
// 아래 네 이름은 예전처럼 이 파일에서도 가져갈 수 있게 다시 내보낸다.
import {
  COMPLEX_MAX_QUERIES,
  FEED_LOCALE,
  GOOGLE_NEWS_RSS,
  MAX_ARTICLES_PER_QUERY,
  MAX_DONG_QUERIES,
  MAX_FEED_LENGTH,
  NATIONWIDE_QUERIES,
  PERIOD_BY_SCOPE,
  REQUEST_TIMEOUT_MS,
  SIDO_QUERY_WORDS,
  SIGUNGU_TITLE_WORDS,
  USER_AGENT,
} from './newsRules.js';

export { MAX_DONG_QUERIES, NATIONWIDE_QUERIES, SIDO_QUERY_WORDS, SIGUNGU_TITLE_WORDS };

export const buildFeedUrl = (query, scope = 'NATIONWIDE') =>
  `${GOOGLE_NEWS_RSS}?q=${encodeURIComponent(`${query} ${PERIOD_BY_SCOPE[scope]}`)}&${FEED_LOCALE}`;

// ===== RSS 읽기(라이브러리 없음) =====

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decodeEntities = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });

// 태그 안의 글자. 진짜 태그(<b> 등)를 먼저 떼고 나서 엔티티를 푼다 — 순서가 반대면 제목에 글자로 쓴
// "&lt;단독&gt;" 까지 태그로 보고 지워 버린다. CDATA 안은 엔티티를 풀지 않는다. 공백은 하나로.
const stripTags = (text) => text.replace(/<[^>]*>/g, '');

export const readXmlText = (raw) => {
  const parts = [];
  let last = 0;
  for (const match of raw.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)) {
    parts.push(decodeEntities(stripTags(raw.slice(last, match.index))), stripTags(match[1]));
    last = match.index + match[0].length;
  }
  parts.push(decodeEntities(stripTags(raw.slice(last))));
  return parts.join('').replace(/\s+/g, ' ').trim();
};

const tagText = (xml, tag) => {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  return match ? readXmlText(match[1]) : '';
};

// "Mon, 26 Oct 2026 03:00:00 GMT" → Date. 읽지 못하면 null.
export const parsePubDate = (pubDate) => {
  const date = new Date(pubDate);
  return pubDate && !Number.isNaN(date.getTime()) ? date : null;
};

// 제목 끝의 " - 언론사" 를 뗀다. <source> 가 있으면 그 이름으로, 없으면 마지막 " - " 뒤를 언론사로 본다.
export const splitTitleSource = (rawTitle, sourceTag) => {
  const title = rawTitle.trim();
  if (sourceTag) {
    const tail = ` - ${sourceTag}`;
    return { title: title.endsWith(tail) ? title.slice(0, -tail.length).trim() : title, source: sourceTag };
  }
  const at = title.lastIndexOf(' - ');
  if (at > 0 && at < title.length - 3) return { title: title.slice(0, at).trim(), source: title.slice(at + 3).trim() };
  return { title, source: null };
};

// RSS 문서 → 기사(최신순, 최대 20건). 링크는 구글 경유 주소 그대로(원문으로 풀지 않는다), 없으면 guid. 같은 링크는 한 건.
export const parseRssItems = (xml) => {
  const seen = new Set();
  const articles = [];
  for (const match of String(xml).matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const item = match[1];
    const url = tagText(item, 'link') || tagText(item, 'guid');
    const publishedAt = parsePubDate(tagText(item, 'pubDate'));
    const { title, source } = splitTitleSource(tagText(item, 'title'), tagText(item, 'source'));
    if (!url || !/^https?:\/\//.test(url) || !publishedAt || !title || seen.has(url)) continue;
    seen.add(url);
    articles.push({ title, url, source, publishedAt });
  }
  return articles.sort((a, b) => b.publishedAt - a.publishedAt).slice(0, MAX_ARTICLES_PER_QUERY);
};

// ===== 받기 =====

// 검색어 하나. 실패(응답 오류·타임아웃·너무 긴 응답)하면 던진다 — 부르는 쪽이 기록하고 다음 검색어로.
const fetchFeed = async (query, scope, fetchImpl) => {
  const response = await fetchImpl(buildFeedUrl(query, scope), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml;q=0.9' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const xml = await response.text();
  if (xml.length > MAX_FEED_LENGTH) throw new Error('응답이 너무 김');
  return parseRssItems(xml);
};

// 검색어들을 순서대로. 하나가 실패해도 나머지는 계속, 시간 예산을 넘길 것 같으면 남은 것은 건너뛴다.
const fetchQueries = async (queries, scope, { fetchImpl, now, deadline }) => {
  const articles = [];
  const skippedQueries = [];
  for (const query of queries) {
    if (deadline !== undefined && now() + REQUEST_TIMEOUT_MS > deadline) {
      skippedQueries.push(query);
      continue;
    }
    try {
      articles.push(...(await fetchFeed(query, scope, fetchImpl)));
    } catch (error) {
      console.warn(`[community-news] 검색어 "${query}" 실패: ${error.name === 'TimeoutError' ? '타임아웃' : error.message}`);
    }
  }
  if (skippedQueries.length > 0) {
    console.warn(`[community-news] 시간 예산 초과 — 다음 실행으로 넘김: ${skippedQueries.join(', ')}`);
  }
  // 검색어끼리 겹친 기사는 하나로
  const seen = new Set();
  return { articles: articles.filter((article) => !seen.has(article.url) && seen.add(article.url)), skippedQueries };
};

// 시·군·구는 intitle 3개 + 동 최대 2개, 시·도는 "{약칭} {낱말}"(약칭이 둘이면 둘 다 — 광주·전남), 전국은 정해 둔 검색어,
// 단지는 단지 이름을 따옴표로 묶어 최대 2개(newsRules.js).
export const toQueries = ({ scope, sigunguQueryName, dongQueryNames = [], sidoNames = [], complexQueryNames = [] }) => {
  if (scope === 'NATIONWIDE') return NATIONWIDE_QUERIES;
  if (scope === 'COMPLEX') return complexQueryNames.slice(0, COMPLEX_MAX_QUERIES).map((name) => `"${name}"`);
  if (scope === 'SIDO') return sidoNames.flatMap((name) => SIDO_QUERY_WORDS.map((word) => `${name} ${word}`));
  if (!sigunguQueryName) return [];
  return [
    ...SIGUNGU_TITLE_WORDS.map((word) => `intitle:${sigunguQueryName} ${word}`),
    ...dongQueryNames.slice(0, MAX_DONG_QUERIES).map((dong) => `${dong} 아파트`),
  ];
};

export const fetchNews = async (target, { fetchImpl = globalThis.fetch, now = Date.now, deadline } = {}) => {
  const queries = toQueries(target);
  if (queries.length === 0) return { articles: [], skippedQueries: [] };
  return fetchQueries(queries, target.scope, { fetchImpl, now, deadline });
};
