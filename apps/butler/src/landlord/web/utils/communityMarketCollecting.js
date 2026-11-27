import { formatKstDate } from './communityFormat';

// 시세 "모으는 중"(collectionStatus COLLECTING) 안내 — 웹 시세 탭(CommunityMarketPage) · 웹 브리핑(BriefingMarket) · 앱 시세 · 앱 브리핑이 같이 쓴다.
// 순수 함수 · 상수. 서버는 COLLECTING 응답에만 collectionProgress 를 준다(그 시군구 · 그 종류, 보관 기간의 달 기준 —
// collectedMonths = 한 번이라도 모은 달, failedMonths = 시도했지만 한 번도 못 모은 달, requiredMonths = 보관 기간 달 수).
// 셋 중 하나(kind)로 가른다 — 위에서부터 먼저 맞는 것:
//   PARTIAL  collectedMonths > 0                    일부 모음(실패한 달이 있어도) — "모으는 중 · 최근 13개월 중 n개월을 모았어요"
//   FAILED   collectedMonths 0 · failedMonths > 0   하나도 못 모음 + 실패 — "아직 못 불러옴 · 매일 새벽 다시 시도 · 마지막 시도 {날짜}"
//   FIRST    collectedMonths 0 · failedMonths 0     아직 시도 전(또는 이전 서버라 collectionProgress 없음) — 11/17 문구
//
// #267 2차 — 모은 만큼 보여 주기: 서버가 일부 모음(COLLECTING) 응답에 모은 달의 데이터를 준다(monthly 의 달마다 collected).
// 그 데이터가 있으면(partialCoverage) 화면은 위 안내 대신 실제 데이터(대표 숫자 · 차트 · 최근 거래)를 보이고, 아래에 작게
// "최근 13개월 중 8개월 기준 · 나머지는 매일 새벽 채워요"(partialBasisParts) 를 붙인다. 빠진 달 때문에 틀릴 수 있는 숫자는
// utils/communityMarketSummary 가 막는다. 위 PARTIAL 안내는 이제 응답에 모은 달 데이터가 없을 때(이전 서버)만 쓴다.

// ===== 아직 시도 전(FIRST) — 11/17 문구 그대로 =====
// 왜 "하루 안에": 정기 실행이 하루 한 번이고, 아직 차례가 안 온 달은 다음 실행에서 채워진다(시세 계획서 5절)
export const COLLECTING_TITLE = '이 단지의 실거래를 모으는 중이에요';
export const COLLECTING_DESCRIPTION = '하루 안에 채워집니다. 그때 다시 열어 주세요.';
export const COLLECTING_BRIEFING_TEXT = '실거래를 모으는 중이에요. 하루 안에 채워집니다';

// ===== 일부 모음(PARTIAL — collectedMonths > 0) =====
// 왜 실패 안내를 쓰지 않나: 11/27 배포 노원구가 13개월 중 8개월을 모아 놓고도 "아직 불러오지 못했어요" 로 보였다. 남은 5개월의 실패 코드는
// 키를 바꾸기 전(11/25) 기록이었고, 그날 새벽에는 차례가 오지 않았을 뿐이다(#267). 모은 만큼을 사실대로 말하고, 남은 달은 이어서 모은다고 적는다.
// 실패 없이 일부만 모은 경우(처음 모으는 중)도 같다 — "하루 안에" 보다 몇 개월째인지가 정확하다.
// 왜 13 을 박지 않나: 보관 기간은 서버 규칙(marketPriceRules KEEP_MONTHS)이라 응답의 requiredMonths 를 그대로 쓴다.
// 왜 "이어서": 정기 실행이 매일 새벽 02:00 한 번, 한 번에 45초씩이라 남은 달이 많으면 하루를 넘길 수 있다 — 기한을 약속하지 않는다
export const COLLECT_PARTIAL_TITLE = '시세를 모으는 중이에요';
export const COLLECT_PARTIAL_CONTINUE_TEXT = '매일 새벽 이어서 모아요';
// "최근 {requiredMonths}개월 중 {collectedMonths}개월을 모았어요" 의 조각 — 숫자는 숫자 그대로 두고 화면이 숫자 글꼴로 감싼다(design.md 숫자 글꼴).
// 글로 보려면 join('')
export const collectedMonthsParts = ({ requiredMonths, collectedMonths }) => ['최근 ', requiredMonths, '개월 중 ', collectedMonths, '개월을 모았어요'];

// ===== 일부 모음 데이터 보이기(#267 2차) =====
// 일부 모음 데이터가 있으면 { collectedMonths, requiredMonths }, 아니면 null(READY · 하나도 못 모음 · 이전 서버).
// 판단은 응답의 monthly 에 모은 달(collected true)이 있는지 — collectionProgress 만 보고 정하면 이전 서버 응답(monthly 빈 배열)에서 빈 화면이 된다.
// 개월 수는 collectionProgress(보관 기간 기준, 서버와 같은 숫자), 없으면 monthly 에서 센다
export const partialCoverage = (prices) => {
  if (prices?.collectionStatus !== 'COLLECTING' || !prices.monthly?.some((row) => row.collected === true)) return null;
  const progress = prices.collectionProgress;
  return {
    collectedMonths: progress?.collectedMonths ?? prices.monthly.filter((row) => row.collected).length,
    requiredMonths: progress?.requiredMonths ?? prices.monthly.length,
  };
};
// 카드 아래 작은 한 줄 "최근 {requiredMonths}개월 중 {collectedMonths}개월 기준 · 나머지는 매일 새벽 채워요" 의 조각(숫자는 화면이 숫자 글꼴로).
// 왜: 보이는 숫자 · 차트 · 거래가 모은 달만으로 만든 것임을 밝힌다. "매일 새벽" — 정기 실행이 매일 02:00(서버 marketPriceRules.SCHEDULE)
export const partialBasisParts = ({ requiredMonths, collectedMonths }) => ['최근 ', requiredMonths, '개월 중 ', collectedMonths, '개월 기준 · 나머지는 매일 새벽 채워요'];
// 모은 달에 거래가 하나도 없을 때 — "최근 거래가 없습니다" 는 13개월 전부를 본 것처럼 읽히므로 본 범위를 밝힌다
export const partialDealsEmptyText = ({ collectedMonths }) => `모은 ${collectedMonths}개월 동안 거래가 없습니다`;
// 시세 탭 · 브리핑 시세 칸의 같은 경우(면적대 · 거래 유형까지) — READY 의 "{면적대}에는 최근 {유형} 거래가 없습니다" 대신
export const partialMarketEmptyText = ({ collectedMonths }, bandLabel, dealTypeLabel) => `모은 ${collectedMonths}개월 동안 ${bandLabel} ${dealTypeLabel} 거래가 없습니다`;
// 모은 달에 그 조건의 거래가 하나도 없는지(일부 모음일 때만 뜻이 있다)
export const hasNoPartialDeals = (prices) => prices.recentDeals.length === 0 && !prices.monthly.some((row) => row.collected && row.dealCount > 0);
// 최근 3개월이 다 모이지 않아 평균을 보이지 않을 때의 설명(utils/communityMarketSummary recentSummary 가 쓴다)
export const AVERAGE_COLLECTING_TEXT = '최근 3개월 평균은 모으는 중';
// 차트의 못 모은 달 띠 · 범례 글자 — "매매 수집 중" · "전세 수집 중" · "월세 수집 중"(거래 이름은 DEAL_TYPES 의 이름 그대로).
// 왜 거래 이름을 붙이나: 매매와 전월세는 따로 모은다 — 매매 화면의 전세 선(비교 선)은 매매를 못 모은 달에도 데이터가 있을 수 있어,
// 그냥 "수집 중" 이면 띠 안에 선이 지나가는 것이 모순으로 읽힌다(#267 2차 캡처). 띠는 지금 고른 거래(주 선)의 못 모은 달에만 그린다
export const missingMonthsLabel = (dealTypeLabel) => `${dealTypeLabel} 수집 중`;

// ===== 하나도 못 모음 + 받기 실패(FAILED — collectedMonths 0 · failedMonths > 0) =====
// 왜 "하루 안에" 를 쓰지 않나: 실패가 이어지면 하루가 지나도 채워지지 않는다 — 11/19 부터 배포 사이트에서 며칠째 "하루 안에 채워집니다" 가
// 떠 있었다(11/25). 지킬 수 없는 약속 대신 사실만 적는다: 아직 못 불러옴 · 매일 새벽 다시 시도함 · 마지막으로 시도한 날.
// 왜 "새벽": 정기 실행이 매일 02:00(한국 시간 — 서버 marketPriceRules.SCHEDULE). 실패하면 그 달은 다음 실행에서 앞 차례로 다시 시도된다.
// 실패 코드(lastErrorCode)는 화면에 쓰지 않는다 — 임대인에게는 뜻이 없고, 응답에 있으니 개발자 도구로 본다
export const COLLECT_FAILED_TITLE = '시세를 아직 불러오지 못했어요';
export const COLLECT_FAILED_RETRY_TEXT = '매일 새벽 다시 시도하고 있어요';
export const COLLECT_FAILED_LAST_ATTEMPT_LABEL = '마지막 시도';

// COLLECTING 응답 → { kind, title, progressParts, description, lastAttemptDate }. 화면은 설명 줄을 이 순서로 " · " 로 잇는다:
//   progressParts   PARTIAL 만 — collectedMonthsParts 의 조각(그 밖은 null)
//   description     설명(PARTIAL 이면 "매일 새벽 이어서 모아요")
//   lastAttemptDate FAILED 만 — 한국 날짜 'YYYY-MM-DD'(시도 시각이 없으면 null), 화면이 "마지막 시도 {날짜}" 로 붙인다
// 브리핑은 FIRST 만 한 줄(COLLECTING_BRIEFING_TEXT), PARTIAL · FAILED 는 제목 · 설명 두 줄
export const collectingNotice = (prices) => {
  const progress = prices?.collectionProgress;
  if (progress?.collectedMonths > 0 && progress.requiredMonths > 0) {
    return {
      kind: 'PARTIAL',
      title: COLLECT_PARTIAL_TITLE,
      progressParts: collectedMonthsParts(progress),
      description: COLLECT_PARTIAL_CONTINUE_TEXT,
      lastAttemptDate: null,
    };
  }
  if (progress?.failedMonths > 0) {
    return {
      kind: 'FAILED',
      title: COLLECT_FAILED_TITLE,
      progressParts: null,
      description: COLLECT_FAILED_RETRY_TEXT,
      lastAttemptDate: progress.lastAttemptedAt ? formatKstDate(progress.lastAttemptedAt) : null,
    };
  }
  return { kind: 'FIRST', title: COLLECTING_TITLE, progressParts: null, description: COLLECTING_DESCRIPTION, lastAttemptDate: null };
};
