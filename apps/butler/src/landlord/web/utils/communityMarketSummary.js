// 시세 화면 계산 — 시세 응답(api-contract "시세" 모양)에서 대표 숫자 · 증감률 · 차트 값을 뽑는다. 순수 함수.
// 데이터는 시세 API(국토교통부 실거래가, GET /market-prices/complexes/:complexId)의 응답이다.

export const DEAL_TYPES = [
  { value: 'SALE', label: '매매' },
  { value: 'JEONSE', label: '전세' },
  { value: 'MONTHLY', label: '월세' },
];
export const getDealTypeLabel = (dealType) => DEAL_TYPES.find((type) => type.value === dealType)?.label ?? dealType;

// 전용면적 구간(칩 문구). 면적이 경계값이면 아래 구간(60㎡ 는 "60㎡ 이하") — 내 호실 표시용. areaMin · areaMax 는 규격 쿼리 값.
// 서버도 같은 경계로 거른다(areaMin < 전용면적 ≤ areaMax, 시세 규칙 파일 areaRange) — 한 거래는 한 칸에만 나온다.
export const AREA_BANDS = [
  { key: 'le60', label: '60㎡ 이하', areaMax: 60, contains: (area) => area <= 60 },
  { key: '60to85', label: '60–85㎡', areaMin: 60, areaMax: 85, contains: (area) => area > 60 && area <= 85 },
  { key: '85to105', label: '85–105㎡', areaMin: 85, areaMax: 105, contains: (area) => area > 85 && area <= 105 },
  { key: 'gt105', label: '105㎡ 초과', areaMin: 105, contains: (area) => area > 105 },
];

// 내 호실이 걸친 구간 전부(점 표시)와 기본 선택 — 호실이 많은 구간, 같으면 면적이 큰 구간.
// 내 호실 면적을 모르면 60–85㎡ 로 시작한다.
export const pickAreaBands = (myAreas) => {
  const counts = AREA_BANDS.map((band) => myAreas.filter((area) => band.contains(area)).length);
  let active = -1;
  counts.forEach((count, index) => {
    if (count > 0 && (active === -1 || count >= counts[active])) active = index;
  });
  return {
    owned: new Set(AREA_BANDS.filter((_band, index) => counts[index] > 0).map((band) => band.key)),
    defaultKey: AREA_BANDS[active === -1 ? 1 : active].key,
  };
};

// 거래 유형별로 쓰는 값: 매매는 가격, 전세는 보증금, 월세는 월세 금액(차트 · 증감률 · 평균)
const MONTHLY_FIELD = { SALE: 'avgPrice', JEONSE: 'avgDeposit', MONTHLY: 'avgMonthlyRent' };
export const monthlyValue = (row, dealType) => row[MONTHLY_FIELD[dealType]];

// 평균 금액 반올림 — 왜: 평균은 원 단위까지 맞을 필요가 없고 "10억 5,967만" 보다 "10억 6,000만" 이 읽기 쉽다.
// 매매가 · 보증금 평균은 백만 원 단위로(큰 숫자 · 전세 평균 · 차트 점). 월세 금액은 백만 원이면 250만 → 300만 처럼 너무 거칠어 만 원 그대로.
// "최근 거래" 표의 개별 거래 금액은 반올림하지 않는다
export const roundAverage = (won, field) => (won === null || won === undefined ? won : field === 'avgMonthlyRent' ? won : Math.round(won / 1000000) * 1000000);
// 차트 점의 값(반올림한 평균)
export const chartValue = (row, dealType) => roundAverage(monthlyValue(row, dealType), MONTHLY_FIELD[dealType]);

const shiftMonth = (yearMonth, delta) => {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

// ===== 이번 달 빼기 =====
// 왜: 실거래 신고 기한이 계약 후 30일이라 이번 달(한국 날짜)은 거래가 반쪽만 들어와 있다 — 차트 · 큰 숫자 · 증감은 지난달까지로 계산하고,
// 이번 달 거래는 "최근 거래" 목록에만 보인다. 서버 응답(monthly)은 규격 기본 기간(이번 달 포함 12개월) 그대로 두고 화면에서 거른다
export const RECENT_MONTHS = 3;
const kstYearMonth = (now) => new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);
export const lastCompleteMonth = (now = new Date()) => shiftMonth(kstYearMonth(now), -1);
export const completedMonthly = (monthly, now = new Date()) => monthly.filter((row) => row.yearMonth <= lastCompleteMonth(now));

// 차트에 그릴 달: 지난달까지 최근 12개월. 모은 기간(coveredFromYearMonth)보다 앞 달은 빼서 늘 비는 칸이 없게
// (서버가 이번 달 포함 13개월을 모아 지난달까지 12개월이 다 찬다 — 처음 모으는 중인 시군구만 짧다)
export const chartMonths = (coveredFromYearMonth, now = new Date(), count = 12) => {
  const end = lastCompleteMonth(now);
  let start = shiftMonth(end, -(count - 1));
  if (coveredFromYearMonth && coveredFromYearMonth > start) start = coveredFromYearMonth;
  const months = [];
  for (let month = start; month <= end; month = shiftMonth(month, 1)) months.push(month);
  return months;
};


// 최근 3개월(endMonth 까지, 그 달 포함) 평균 — 건수 가중, 반올림 전. 거래가 없으면 null.
export const recentAverage = (monthly, endMonth, field) => {
  const from = shiftMonth(endMonth, -(RECENT_MONTHS - 1));
  const rows = monthly.filter((row) => row.yearMonth >= from && row.yearMonth <= endMonth && row[field] !== null && row[field] !== undefined);
  const count = rows.reduce((sum, row) => sum + row.dealCount, 0);
  return count === 0 ? null : rows.reduce((sum, row) => sum + row[field] * row.dealCount, 0) / count;
};

// 증감(%) — 최근 3개월 평균 ÷ 직전 3개월(그 앞 3개월) 평균 − 1. 둘 중 하나라도 거래가 없으면 null. 반올림 전 값으로
export const periodChange = (monthly, endMonth, field) => {
  const recent = recentAverage(monthly, endMonth, field);
  const before = recentAverage(monthly, shiftMonth(endMonth, -RECENT_MONTHS), field);
  return recent !== null && before ? ((recent - before) / before) * 100 : null;
};
// 증감 문구 — 왜 색이 아니라 ▲▼: 한국 관행은 빨강 = 오름 · 파랑 = 내림이라 빨강 "-" 가 헷갈린다. 글자색은 기본(ink-2), 비교 대상을 붙인다
export const formatChange = (rate) => {
  if (rate === null || rate === undefined) return null;
  if (Math.abs(rate) < 0.05) return `직전 ${RECENT_MONTHS}개월과 같음`;
  return `직전 ${RECENT_MONTHS}개월보다 ${rate > 0 ? '▲' : '▼'}${Math.abs(rate).toFixed(1)}%`;
};

// 대표 숫자 · 설명 한 줄 · 증감(시세 탭 · 브리핑이 같이 쓴다). 모두 지난달까지, 평균은 반올림(roundAverage).
// headline: 매매 · 전세는 최근 3개월 평균 금액, 월세는 "보증금 X / 월 Y". caption: "최근 3개월 평균 · 60–85㎡ · 전세 4억 6,000만"
// — 큰 숫자에 나온 금액은 되풀이하지 않고, 매매 화면에서만 전세 평균을 덧붙인다(jeonse 가 있을 때)
export const recentSummary = ({ prices, jeonse = null, dealType, band, now = new Date() }) => {
  const endMonth = lastCompleteMonth(now);
  const average = (data, field) => (data ? roundAverage(recentAverage(data.monthly, endMonth, field), field) : null);
  const extras = [];
  let headline = null;
  if (dealType === 'SALE') {
    const sale = average(prices, 'avgPrice');
    const deposit = average(jeonse, 'avgDeposit');
    if (sale !== null) headline = formatWon(sale);
    if (deposit !== null) extras.push(`전세 ${formatWon(deposit)}`);
  } else if (dealType === 'JEONSE') {
    const deposit = average(prices, 'avgDeposit');
    if (deposit !== null) headline = formatWon(deposit);
  } else {
    const deposit = average(prices, 'avgDeposit');
    const rent = average(prices, 'avgMonthlyRent');
    if (deposit !== null && rent !== null) headline = `보증금 ${formatWon(deposit)} / 월 ${formatWon(rent)}`;
  }
  const caption = headline
    ? [`최근 ${RECENT_MONTHS}개월 평균`, band.label, ...extras].join(' · ')
    : `최근 ${RECENT_MONTHS}개월 ${getDealTypeLabel(dealType)} 거래 없음 · ${band.label}`;
  const rate = periodChange(prices.monthly, endMonth, MONTHLY_FIELD[dealType]);
  return { endMonth, headline, caption, rate, changeText: formatChange(rate) };
};

// 원 → "12억 3,000만" / "12억 500만" / "9억" / "8,000만" / "280만" (만원 아래는 반올림)
export const formatWon = (won) => {
  const manwon = Math.round(won / 10000);
  const eok = Math.floor(manwon / 10000);
  const rest = manwon % 10000;
  if (eok === 0) return `${rest.toLocaleString('ko-KR')}만`;
  return rest === 0 ? `${eok}억` : `${eok}억 ${rest.toLocaleString('ko-KR')}만`;
};
