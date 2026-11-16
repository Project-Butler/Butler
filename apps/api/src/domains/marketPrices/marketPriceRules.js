// 시세(실거래가) 수집 · 응답 규칙 — 한 파일에 모은다(뉴스 규칙 파일 newsRules.js 와 같은 모양, 시세 계획서 5절).
// rtmsProvider.js(받기) · linkComplex.js(잇기) · service/*.js(수집 · 읽기)는 여기 값을 읽기만 한다.
//
// ┌ 규칙 요약 ──────────────────────────────────────────────────────────────────────────────────────┐
// │ 어디서 국토교통부 실거래가 API 두 개(아파트 매매 상세 · 아파트 전월세). 외부 호출은 rtmsProvider.js 만    │
// │ 언제   매일 02:00(한국 시간) 한 번. 요청 경로(사용자가 시세를 볼 때)에서는 부르지 않는다                │
// │        실제 일정 등록은 apps/api/vercel.json(A팀 파일) — 등록 요청 중, 지금은 직접 부를 때만 돈다         │
// │ 어느 곳 커뮤니티를 읽을 수 있는 임대인(활성 소유, 인증 취소 아님)의 단지가 있는 시군구만                   │
// │ 얼마나 시군구마다 최근 12개월. 처음 보는 시군구는 12개월을 채우고, 모두 최근 3개월을 매일 다시 모은다      │
// │ 저장   (시군구, 계약월, 매매/전월세) 묶음 단위로 지우고 새로 넣는다 — 해제된 거래가 빠지게              │
// │ 잇기   도로명 키 → 지번 → 단지 일련번호(aptSeq) 순. 이름으로는 잇지 않는다                             │
// │ 한도   요청마다 8초, 한 번 실행 45초, 동시에 4개. 시간이 모자라면 오래 안 모은 묶음부터, 남은 것은 다음 번 │
// └──────────────────────────────────────────────────────────────────────────────────────────────────┘

// ===== 일정 =====
// 경로는 cronRouter.js 와 같아야 한다(테스트로 확인). cron 식은 UTC — "0 17 * * *" = 한국 시간 02:00.
// 왜 하루 한 번: 원천 자료가 "일 1회" 갱신이고, 이사님이 시세 갱신을 하루 단위로 정했다(계획서 1절)
// 왜 02:00: 사용자가 적은 시간이고, 뉴스(06:00) · 투표 정리(00:00)와 겹치지 않는다
export const SCHEDULE = { path: '/api/cron/market-prices', cron: '0 17 * * *', kst: '매일 02:00' };

// ===== 어디서 · 어떻게 요청하나 =====
// 왜 이 둘: 매매는 "상세" 쪽이어야 도로명 · 지번 · 단지 일련번호가 와서 우리 단지에 이을 수 있다. 전월세는 하나뿐
export const RTMS_ENDPOINTS = {
  TRADE: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev',
  RENT: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
};
// 왜 이 값: 활용 가이드의 정상 결과 코드. 그 밖은 실패로 보고 그 묶음을 건드리지 않는다(지운 뒤 못 채우는 일이 없게)
export const RESULT_OK = '000';
// 왜: 가이드 오류표의 "03 No Data" — 그 달에 거래가 없는 것이지 실패가 아니다(0건으로 저장)
export const RESULT_NO_DATA = '03';

// ===== 요청 한도 =====
// 왜 8초: 한 달치가 늦어도 나머지를 막지 않게(가이드의 평균 응답 0.5초)
export const REQUEST_TIMEOUT_MS = 8000;
// 왜 45초: vercel.json 함수 제한 60초 안에서 DB 저장 몫을 남긴다(뉴스와 같음)
export const RUN_BUDGET_MS = 45 * 1000;
// 왜 4: 원천 한도 초당 30건 안에서 여유를 두고, 한 시군구 12개월 × 2 종류(24번)를 몇 초 안에 끝낸다
export const CONCURRENCY = 4;
// 왜 1000: 송파구 한 달 전월세가 수백 ~ 천여 건 — 한 번에 받으면 하루 호출 한도(개발 계정 10,000번)를 아낀다
export const PAGE_SIZE = 1000;
// 왜 10: 1000 × 10 = 1만 건. 한 시군구 한 달 거래가 이보다 많으면 무언가 잘못된 것 — 끝없이 넘기지 않는다
export const MAX_PAGES = 10;
// 왜 8MB: 1000건 한 페이지가 1MB 안팎. 비정상적으로 큰 응답은 읽지 않는다
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

// ===== 기간 =====
// 왜 12개월: 연동 규격의 기본 조회 기간이 최근 12개월이다
export const KEEP_MONTHS = 12;
// 왜 3개월: 신고 기한이 계약 후 30일이고, 해제 · 정정도 뒤늦게 들어온다 — 최근 석 달은 매일 다시 받는다
export const REFRESH_MONTHS = 3;
// 왜 20시간: "하루 한 번" 이라 같은 날 손으로 여러 번 불러도 최근 석 달을 또 받지 않게(하루 호출 한도를 아낀다).
// 24시간이 아니라 20시간인 것은 정기 실행 시각이 몇 분씩 밀려도 다음 날 실행에서 빠지지 않게
export const REFRESH_MIN_AGE_MS = 20 * 60 * 60 * 1000;
// 왜: 이번 달(오늘이 든 달)도 모은다 — 계약 직후 신고된 거래가 이미 있다. 기간은 "이번 달부터 거꾸로 N개월"
export const INCLUDE_CURRENT_MONTH = true;

// ===== 금액 · 거래 종류 =====
// 왜: 원천 금액은 만원 단위 문자열("12,000"), 규격 응답은 원 단위 숫자
export const MANWON = 10000;
// 왜: 전월세 원천에 종류 칸이 없다. 월세금액이 0 이면 전세, 0 보다 크면 월세(계획서 3절)
export const rentDealType = (monthlyRentManwon) => (monthlyRentManwon > 0 ? 'MONTHLY' : 'JEONSE');
// 왜: 해제여부(cdealType)가 채워진 매매는 취소된 거래 — 저장하지 않는다(계획서 3절). 전월세에는 이 칸이 없다
export const isCancelledTrade = (item) => Boolean(item.cdealType);

// ===== 잇기 =====
// 왜 이 순서: 도로명 키는 우리 Complex.sourceKey 와 같은 규칙이라 가장 정확하고, 지번은 도로명이 빈 행을,
// 단지 일련번호는 둘 다 빈 행을 보완한다. 이름은 같은 이름 단지가 많아 쓰지 않는다(계획서 4절)
export const LINK_ORDER = ['ROAD', 'JIBUN', 'APT_SEQ'];
// 왜 0(지상): 전월세 일부 행은 도로명지상지하코드(roadnmbcd)가 비어 온다(11/17 송파구 실제 응답). 아파트 주소는 거의 지상이라
// 비었으면 지상으로 본다 — 틀려도 그 거래만 도로명으로 못 이을 뿐, 지번 · 단지 일련번호로 다시 잇는다
export const ROAD_UNDERGROUND_WHEN_BLANK = 0;
// 왜: 같은 도로명주소를 쓰는 다른 단지가 섞이지 않게(11/17 해운대자이 1 · 2단지 — 둘 다 해운대로 435, 지번은 1527 · 1529).
// 다른 단지를 섞느니 덜 보이는 쪽(커뮤니티 단지 뉴스와 같은 원칙) — 거래와 우리 단지 양쪽에 지번이 있고 서로 다르면
// 도로명으로는 잇지 않고 다음 방법(지번)으로 넘어간다. 한쪽에 지번이 없으면 도로명으로 잇는다
export const ROAD_LINK_NEEDS_SAME_LOT = true;

// ===== 응답 =====
// 왜: 활용신청서에 "출처 표시" 를 적었다 — 응답 source 와 화면 출처 줄
export const SOURCE = '국토교통부 실거래가';
// 왜 20건: 연동 규격 recentDeals 가 최근 20건
export const RECENT_DEALS = 20;
// 왜: 연동 규격의 dealType 세 가지
export const DEAL_TYPES = ['SALE', 'JEONSE', 'MONTHLY'];
// 왜 아래 끝 미포함 · 위 끝 포함(areaMin < 전용면적 ≤ areaMax): 국민주택 규모를 "85㎡ 이하" 로 부르는 관행과 화면 칩(60㎡ 이하 · 60–85 ·
// 85–105 · 105 초과)이 같고, 한 거래가 이웃한 두 칩에 나오지 않게(11/17 양끝 포함일 때 송파 한 달 1,532건 중 13건이 두 칩에 나왔다).
// 한쪽이 없으면 그쪽 끝은 제한 없음(첫 칩은 areaMax 만, 마지막 칩은 areaMin 만). 반환은 Prisma 숫자 조건
export const areaRange = (areaMin, areaMax) => ({
  ...(areaMin !== null && areaMin !== undefined ? { gt: areaMin } : {}),
  ...(areaMax !== null && areaMax !== undefined ? { lte: areaMax } : {}),
});

// ===== 처음 보는 단지(COLLECTING) =====
// 왜 Job: 규격이 jobId 를 준다. GET /jobs/:jobId 는 요청한 본인 · ADMIN 만 보므로 요청한 사람 이름으로 만든다(계획서 5절)
export const BACKFILL_JOB_TYPE = 'MARKET_PRICE_BACKFILL';
