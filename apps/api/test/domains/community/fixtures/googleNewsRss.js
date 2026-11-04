// 구글 뉴스 RSS 검색 응답의 고정 모양(테스트용). 실제 응답처럼 <item> 에 title·link·guid·pubDate·description·source 가 온다.
// 테스트마다 기사 값만 바꿔 쓰도록 조립 함수로 둔다 — 네트워크를 쓰지 않는다.
export const item = ({ title, link, guid, pubDate = 'Mon, 26 Oct 2026 03:00:00 GMT', source, description = '<a href="x">본문 요약</a>' }) => `
  <item>
    <title>${title}</title>
    ${link === undefined ? '' : `<link>${link}</link>`}
    ${guid === undefined ? '' : `<guid isPermaLink="false">${guid}</guid>`}
    <pubDate>${pubDate}</pubDate>
    <description>${description}</description>
    ${source === undefined ? '' : `<source url="https://press.example">${source}</source>`}
  </item>`;
export const feed = (...items) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title>${items.join('')}</channel></rss>`;
