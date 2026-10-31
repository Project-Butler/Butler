// 참고자료의 원문 링크(sourceUrl). DB 컬럼 없이 sourceKey·제목·사건번호로 만든다.
// 판례는 국가법령정보센터의 그 판례, 법령은 그 조문, 사례집·가이드북은 책을 받을 수 있는 게시글로 연결한다.
// 사례집에 인용된 판례 중 국가법령정보센터에 없는 것은 그 사례집 링크로 보낸다.
// 출처 목록은 prisma/seed-data/README.md.

const LAW_GO_KR = 'https://www.law.go.kr';

// sourceKey 앞부분 → 법령 이름(국가법령정보센터 주소에 쓰는 띄어쓰기 없는 이름)
const LAW_NAMES = [
  [/^law-hlpa-dec-/, '주택임대차보호법시행령'],
  [/^law-hlpa-/, '주택임대차보호법'],
  [/^law-clpa-dec-/, '상가건물임대차보호법시행령'],
  [/^law-clpa-/, '상가건물임대차보호법'],
  [/^law-civil-/, '민법'],
];

// sourceKey 앞부분 → 책을 받을 수 있는 게시글
const BOOK_URLS = [
  [/^klac-/, 'https://www.hldcc.or.kr/hp/li/arrCaseList.do'],
  [/^seoul-2020-/, 'https://news.seoul.go.kr/citybuild/archives/511154'],
  [/^seoul-2023-counsel-/, 'https://sftc.seoul.go.kr/fe/bbs/NR_view.do?bbsCd=2&bbsSeq=419'],
  [
    /^reb-2025-counsel-/,
    'https://adrhome.reb.or.kr/adrhome/reb/LO010100/bbs/View.do?Key=10501000000002022101718&boardNo=4&boardIdx=181',
  ],
  [
    /^reb-2024-counsel-/,
    'https://adrhome.reb.or.kr/adrhome/reb/LO010100/bbs/View.do?Key=10501000000002022101718&boardNo=4&boardIdx=170',
  ],
  [/^molit-2022-/, 'https://www.molit.go.kr/USR/policyData/m_34681/dtl.jsp?id=4675'],
  // 2025 조정사례집(disputes.json)은 게시글을 찾지 못해 한국부동산원 임대차분쟁조정위원회 홈으로 보낸다.
  [/^casebook-2025-/, 'https://adrhome.reb.or.kr'],
];

// 2025 조정사례집에 인용된 판례 중 국가법령정보센터에 있는 것(사건번호 → 판례 일련번호, 2026-10-30 확인).
// 나머지 11건(대부분 하급심)은 국가법령정보센터에 없어 사례집 링크로 보낸다.
const CASEBOOK_PREC_SEQ = {
  '2005가합100279': 147076,
  '95다14664': 147496,
  '87다카98': 103300,
  '94다34692': 199673,
  '2009다96984': 600955,
  '2019다288232': 211327,
  '2015다34437': 185075,
  '97다26210': 196836,
  '98다8554': 196185,
  '2018다284226': 208744,
  '2017다242867': 186104,
  '2020다253430': 214581,
  '2020다241017': 214271,
};

const findByPattern = (rules, sourceKey) => rules.find(([pattern]) => pattern.test(sourceKey))?.[1];

// "대법원 1994. 12. 9. 선고 94다34692, 94다34708 판결" → "94다34692"
const firstCaseNumber = (caseNumber) => caseNumber?.match(/\d{2,4}[가-힣]+\d+/)?.[0];

const toPrecedentUrl = (precSeq) => `${LAW_GO_KR}/LSW/precInfoP.do?precSeq=${precSeq}`;

export const toSourceUrl = ({ sourceKey, title, caseNumber }) => {
  const precSeq = sourceKey.match(/^lawgo-prec-(\d+)$/)?.[1];
  if (precSeq) return toPrecedentUrl(precSeq);

  const casebookPrecSeq = /^casebook-\d+-P-/.test(sourceKey) && CASEBOOK_PREC_SEQ[firstCaseNumber(caseNumber)];
  if (casebookPrecSeq) return toPrecedentUrl(casebookPrecSeq);

  const lawName = findByPattern(LAW_NAMES, sourceKey);
  if (lawName) {
    const article = title.match(/제\d+조(?:의\d+)?/)?.[0];
    return encodeURI(`${LAW_GO_KR}/법령/${lawName}${article ? `/${article}` : ''}`);
  }

  return findByPattern(BOOK_URLS, sourceKey) ?? null;
};
