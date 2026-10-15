// KST(Asia/Seoul) 기준 날짜 계산 공용 유틸.
// api-contract.md 1장 "날짜·금액·null": D-day·상태 계산은 서버가 KST로 한다.
// "오늘이 며칠인지" 비교가 필요한 곳은 전부 이 파일을 거친다 — new Date()를
// 직접 비교하면 서버 실행 환경 타임존에 따라 하루 밀리는 버그가 생길 수 있다.

const KST_TIME_ZONE = 'Asia/Seoul';

// Date 객체를 KST 기준 'YYYY-MM-DD' 문자열로 바꾼다.
export const formatDateKST = (date) => {
  // en-CA 로케일의 날짜 포맷이 YYYY-MM-DD라 그대로 쓴다.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

// 지금 이 순간의 '오늘'(KST) 날짜 문자열.
export const getTodayKST = () => formatDateKST(new Date());

// Prisma @db.Date 컬럼(JS Date, UTC 자정)을 'YYYY-MM-DD' 문자열로 바꾼다.
// 날짜 전용 컬럼이므로 로컬 타임존 getter(getFullYear 등)가 아니라
// 반드시 UTC getter를 쓴다.
export const toDateOnlyString = (date) => {
  if (!date) return null;
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// 'YYYY-MM-DD' 문자열 두 개를 사전식으로 비교한다(같은 포맷이라 문자열 비교로 충분).
export const compareDateStrings = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// dateB - dateA의 일수 차이. 'YYYY-MM-DD' 문자열만 받는다.
export const daysBetween = (dateA, dateB) => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const a = Date.parse(`${dateA}T00:00:00Z`);
  const b = Date.parse(`${dateB}T00:00:00Z`);
  return Math.round((b - a) / MS_PER_DAY);
};
