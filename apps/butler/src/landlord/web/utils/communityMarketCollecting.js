import { formatKstDate } from './communityFormat';

// 시세 "모으는 중"(collectionStatus COLLECTING) 안내 — 시세 탭(CommunityMarketPage) · 브리핑(BriefingMarket)이 같이 쓴다. 순수 함수 · 상수.
// 서버는 COLLECTING 응답에만 collectionProgress 를 준다(그 시군구 · 그 종류, 보관 기간의 달 기준 — failedMonths = 시도했지만 한 번도 못 모은 달).
// 그 값으로 "처음 모으는 중" 과 "받기가 실패하고 있음" 을 가른다. collectionProgress 가 없으면(이전 서버) 처음 모으는 중으로 본다.

// ===== 처음 모으는 중(실패한 달 없음) — 11/17 문구 그대로 =====
// 왜 "하루 안에": 정기 실행이 하루 한 번이고, 아직 차례가 안 온 달은 다음 실행에서 채워진다(시세 계획서 5절)
export const COLLECTING_TITLE = '이 단지의 실거래를 모으는 중이에요';
export const COLLECTING_DESCRIPTION = '하루 안에 채워집니다. 그때 다시 열어 주세요.';
export const COLLECTING_BRIEFING_TEXT = '실거래를 모으는 중이에요. 하루 안에 채워집니다';

// ===== 받기 실패(failedMonths > 0) =====
// 왜 "하루 안에" 를 쓰지 않나: 실패가 이어지면 하루가 지나도 채워지지 않는다 — 11/19 부터 배포 사이트에서 며칠째 "하루 안에 채워집니다" 가
// 떠 있었다(11/25). 지킬 수 없는 약속 대신 사실만 적는다: 아직 못 불러옴 · 매일 새벽 다시 시도함 · 마지막으로 시도한 날.
// 왜 "새벽": 정기 실행이 매일 02:00(한국 시간 — 서버 marketPriceRules.SCHEDULE). 실패하면 그 달은 다음 실행에서 앞 차례로 다시 시도된다.
// 실패 코드(lastErrorCode)는 화면에 쓰지 않는다 — 임대인에게는 뜻이 없고, 응답에 있으니 개발자 도구로 본다
export const COLLECT_FAILED_TITLE = '시세를 아직 불러오지 못했어요';
export const COLLECT_FAILED_RETRY_TEXT = '매일 새벽 다시 시도하고 있어요';
export const COLLECT_FAILED_LAST_ATTEMPT_LABEL = '마지막 시도';

// COLLECTING 응답 → { failed, title, description, lastAttemptDate }.
// lastAttemptDate 는 한국 날짜 'YYYY-MM-DD'(실패일 때만, 시도 시각이 없으면 null) — 화면이 숫자 글꼴로 " · 마지막 시도 {날짜}" 를 붙인다
export const collectingNotice = (prices) => {
  const progress = prices?.collectionProgress;
  if (progress?.failedMonths > 0) {
    return {
      failed: true,
      title: COLLECT_FAILED_TITLE,
      description: COLLECT_FAILED_RETRY_TEXT,
      lastAttemptDate: progress.lastAttemptedAt ? formatKstDate(progress.lastAttemptedAt) : null,
    };
  }
  return { failed: false, title: COLLECTING_TITLE, description: COLLECTING_DESCRIPTION, lastAttemptDate: null };
};
