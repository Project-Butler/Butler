// 뉴스 공급자(구글 뉴스 RSS) — 네트워크 없이 고정 XML 로.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildFeedUrl,
  fetchNews,
  NATIONWIDE_QUERIES,
  parsePubDate,
  parseRssItems,
  readXmlText,
  SIDO_QUERY_WORDS,
  splitTitleSource,
  toQueries,
} from '../../../src/domains/community/newsProvider.js';
import { feed, item } from './fixtures/googleNewsRss.js';

const okResponse = (xml) => new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
const quiet = async (run) => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return await run();
  } finally {
    console.warn = warn;
  }
};

describe('RSS 읽기', () => {
  test('CDATA 는 그대로, 엔티티는 풀고, 남은 태그는 뗀다', () => {
    assert.equal(readXmlText('<![CDATA[송파구 <b>전세</b> & 월세]]>'), '송파구 전세 & 월세');
    assert.equal(readXmlText('&quot;급등&quot; &amp; &lt;주의&gt; &#39;단독&#39; &#x2F; &nbsp;끝'), '"급등" & <주의> \'단독\' / 끝');
    assert.equal(readXmlText('앞 &amp;amp; <![CDATA[&amp;]]> 뒤'), '앞 &amp; &amp; 뒤'); // CDATA 안은 풀지 않는다
    // 글자로 쓴 꺾쇠(&lt;단독&gt;)는 남기고, 진짜 태그만 뗀다
    assert.equal(readXmlText('&lt;단독&gt; <b>송파구</b> 전세'), '<단독> 송파구 전세');
  });

  test('<source> 가 있으면 그 이름, 제목 꼬리 " - 언론사" 는 뗀다', () => {
    assert.deepEqual(splitTitleSource('송파구 전세 매물 증가 - 한빛일보', '한빛일보'), { title: '송파구 전세 매물 증가', source: '한빛일보' });
    // 꼬리가 다르면 제목은 그대로
    assert.deepEqual(splitTitleSource('송파구 전세 매물 증가', '한빛일보'), { title: '송파구 전세 매물 증가', source: '한빛일보' });
  });

  test('<source> 가 없으면 마지막 " - " 뒤를 언론사로', () => {
    assert.deepEqual(splitTitleSource('A - B 단지 재건축 - 한빛경제', ''), { title: 'A - B 단지 재건축', source: '한빛경제' });
    assert.deepEqual(splitTitleSource('꼬리 없는 제목', ''), { title: '꼬리 없는 제목', source: null });
  });

  test('pubDate 를 Date 로, 읽지 못하면 null', () => {
    assert.equal(parsePubDate('Mon, 26 Oct 2026 03:00:00 GMT').toISOString(), '2026-10-26T03:00:00.000Z');
    assert.equal(parsePubDate(''), null);
    assert.equal(parsePubDate('어제'), null);
  });

  test('item → 제목·링크(구글 경유 그대로)·출처·발행 시각만. description 은 없다. 링크가 없으면 guid', () => {
    const articles = parseRssItems(
      feed(
        item({ title: '송파구 전세 &amp; 월세 - 한빛일보', link: 'https://news.google.com/rss/articles/AAA?oc=5', source: '한빛일보' }),
        item({ title: '해운대 월세 - 바다신문', guid: 'https://news.google.com/rss/articles/BBB', pubDate: 'Tue, 27 Oct 2026 03:00:00 GMT' }),
      ),
    );
    assert.deepEqual(
      articles.map((article) => [article.title, article.url, article.source, article.publishedAt.toISOString()]),
      [
        ['해운대 월세', 'https://news.google.com/rss/articles/BBB', '바다신문', '2026-10-27T03:00:00.000Z'],
        ['송파구 전세 & 월세', 'https://news.google.com/rss/articles/AAA?oc=5', '한빛일보', '2026-10-26T03:00:00.000Z'],
      ],
    );
    assert.ok(articles.every((article) => Object.keys(article).sort().join() === 'publishedAt,source,title,url'));
  });

  test('같은 링크는 한 건, 날짜·링크가 이상한 item 은 뺀다', () => {
    const link = 'https://news.google.com/rss/articles/SAME';
    const articles = parseRssItems(
      feed(
        item({ title: '첫 기사 - 가', link }),
        item({ title: '같은 링크 다른 제목 - 나', link }),
        item({ title: '날짜 없음 - 다', link: 'https://news.google.com/rss/articles/X', pubDate: '?' }),
        item({ title: '링크 이상 - 라', link: 'javascript:alert(1)' }),
      ),
    );
    assert.deepEqual(articles.map((article) => article.title), ['첫 기사']);
  });

  test('검색어 주소: 시·군·구는 최근 30일, 시·도·전국은 7일 + 한국어·한국', () => {
    const url = new URL(buildFeedUrl('intitle:송파 전세', 'SIGUNGU'));
    assert.equal(url.origin + url.pathname, 'https://news.google.com/rss/search');
    assert.equal(url.searchParams.get('q'), 'intitle:송파 전세 when:30d');
    assert.equal(new URL(buildFeedUrl('서울 전세', 'SIDO')).searchParams.get('q'), '서울 전세 when:7d');
    assert.equal(new URL(buildFeedUrl('국토교통부 전세')).searchParams.get('q'), '국토교통부 전세 when:7d');
    assert.deepEqual([url.searchParams.get('hl'), url.searchParams.get('gl'), url.searchParams.get('ceid')], ['ko', 'KR', 'KR:ko']);
  });
});

describe('받기', () => {
  test('검색어를 순서대로 부르고, 정직한 User-Agent·타임아웃을 싣고, 검색어끼리 겹친 기사는 하나로', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ query: new URL(url).searchParams.get('q'), userAgent: options.headers['User-Agent'], signal: options.signal });
      return okResponse(feed(item({ title: '같은 기사 - 가', link: 'https://news.google.com/rss/articles/ONE' })));
    };
    const target = { scope: 'SIGUNGU', sigunguQueryName: '송파', dongQueryNames: ['잠실'] };
    const { articles, skippedQueries } = await fetchNews(target, { fetchImpl });
    assert.deepEqual(calls.map((call) => call.query), toQueries(target).map((query) => `${query} when:30d`));
    assert.ok(calls.every((call) => /^ButlerCommunityNewsBot\//.test(call.userAgent) && !/@/.test(call.userAgent)));
    assert.ok(calls.every((call) => call.signal instanceof AbortSignal));
    assert.equal(articles.length, 1);
    assert.deepEqual(skippedQueries, []);
  });

  test('요청이 실패하거나(오류·타임아웃) 응답이 이상하면 빈 결과 — 가짜 기사로 채우지 않는다', async () => {
    for (const fetchImpl of [
      async () => new Response('', { status: 503 }),
      async () => {
        throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
      },
      async () => okResponse('<html>차단</html>'),
    ]) {
      const { articles } = await quiet(() => fetchNews({ scope: 'NATIONWIDE' }, { fetchImpl }));
      assert.deepEqual(articles, []);
    }
  });

  test('검색어 하나가 실패해도 나머지는 계속한다', async () => {
    const queries = [];
    const fetchImpl = async (url) => {
      const query = new URL(url).searchParams.get('q');
      queries.push(query);
      if (queries.length === 1) return new Response('', { status: 429 });
      return okResponse(feed(item({ title: `${query} - 가`, link: `https://news.google.com/rss/articles/${queries.length}` })));
    };
    const { articles } = await quiet(() => fetchNews({ scope: 'NATIONWIDE' }, { fetchImpl }));
    assert.equal(queries.length, NATIONWIDE_QUERIES.length);
    assert.equal(articles.length, NATIONWIDE_QUERIES.length - 1);
  });

  test('시간 예산을 넘길 것 같으면 남은 검색어는 부르지 않고 넘긴다', async () => {
    let clock = 0;
    const now = () => clock;
    const called = [];
    const fetchImpl = async (url) => {
      called.push(new URL(url).searchParams.get('q'));
      clock += 5000; // 요청 하나에 5초 걸린다고 치면
      return okResponse(feed());
    };
    // 예산 15초, 요청 타임아웃 8초: 0초에 1번, 5초에 2번(5+8=13 ≤ 15), 10초엔 10+8 > 15 라 3번은 넘김
    const { skippedQueries } = await quiet(() => fetchNews({ scope: 'NATIONWIDE' }, { fetchImpl, now, deadline: 15000 }));
    assert.deepEqual(called, NATIONWIDE_QUERIES.slice(0, 2).map((query) => `${query} when:7d`));
    assert.deepEqual(skippedQueries, NATIONWIDE_QUERIES.slice(2));
  });

  test('시·군·구 이름이 없으면 부르지 않는다', async () => {
    let called = false;
    const { articles } = await fetchNews({ scope: 'SIGUNGU' }, { fetchImpl: async () => { called = true; } });
    assert.deepEqual([articles, called], [[], false]);
  });
});

describe('시·도 검색어', () => {
  test('"{약칭} {낱말}" — 약칭이 둘이면 둘 다', async () => {
    const queries = [];
    const fetchImpl = async (url) => {
      queries.push(new URL(url).searchParams.get('q'));
      return new Response('<rss></rss>', { status: 200 });
    };
    await fetchNews({ scope: 'SIDO', sidoNames: ['광주', '전남'] }, { fetchImpl });
    assert.deepEqual(queries, ['광주', '전남'].flatMap((name) => SIDO_QUERY_WORDS.map((word) => `${name} ${word} when:7d`)));
  });
});

describe('시·군·구 검색어', () => {
  test('intitle:{구 약칭} 아파트·전세·재건축 + 인증 동 "{동} 아파트" 최대 2곳', () => {
    assert.deepEqual(toQueries({ scope: 'SIGUNGU', sigunguQueryName: '송파', dongQueryNames: ['잠실', '문정', '가락'] }), [
      'intitle:송파 아파트',
      'intitle:송파 전세',
      'intitle:송파 재건축',
      '잠실 아파트',
      '문정 아파트',
    ]);
    assert.equal(toQueries({ scope: 'SIGUNGU', sigunguQueryName: '해운대' }).length, 3);
    assert.deepEqual(toQueries({ scope: 'SIGUNGU' }), []);
  });
});
