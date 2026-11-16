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
// (서버는 이번 달 포함 12개월을 모으므로 지금은 지난달까지 11개월이 된다)
export const chartMonths = (coveredFromYearMonth, now = new Date(), count = 12) => {
  const end = lastCompleteMonth(now);
  let start = shiftMonth(end, -(count - 1));
  if (coveredFromYearMonth && coveredFromYearMonth > start) start = coveredFromYearMonth;
  const months = [];
  for (let month = start; month <= end; month = shiftMonth(month, 1)) months.push(month);
  return months;
};

// 증감률(%): 거래가 있는 마지막 달 평균 ÷ 그 3개월 전 달 평균 − 1. 둘 중 하나라도 없으면 null. 지난달까지로 거른 monthly 를 넘긴다(recentSummary).
export const changeRate = (monthly, dealType) => {
  const last = monthly[monthly.length - 1];
  if (!last) return null;
  const base = monthly.find((row) => row.yearMonth === shiftMonth(last.yearMonth, -3));
  const [now, before] = [monthlyValue(last, dealType), base && monthlyValue(base, dealType)];
  return now && before ? ((now - before) / before) * 100 : null;
};

// 최근 3개월(endMonth 까지, 그 달 포함) 평균 — 건수 가중. 거래가 없으면 null.
export const recentAverage = (monthly, endMonth, field) => {
  const from = shiftMonth(endMonth, -(RECENT_MONTHS - 1));
  const rows = monthly.filter((row) => row.yearMonth >= from && row.yearMonth <= endMonth && row[field] !== null && row[field] !== undefined);
  const count = rows.reduce((sum, row) => sum + row.dealCount, 0);
  return count === 0 ? null : rows.reduce((sum, row) => sum + row[field] * row.dealCount, 0) / count;
};

// 대표 숫자 · 설명 한 줄 · 증감(시세 탭 · 브리핑이 같이 쓴다). 모두 지난달까지.
// headline: 매매 · 전세는 최근 3개월 평균 금액, 월세는 "보증금 X / 월 Y". caption: "최근 3개월 평균 · 60–85㎡ · 매매 11억 · 전세 4억"
// jeonse: 매매 화면에서 전세 평균도 함께 보일 때만(없으면 매매만)
export const recentSummary = ({ prices, jeonse = null, dealType, band, now = new Date() }) => {
  const endMonth = lastCompleteMonth(now);
  const average = (data, field) => (data ? recentAverage(data.monthly, endMonth, field) : null);
  const parts = [];
  let headline = null;
  if (dealType === 'SALE') {
    const sale = average(prices, 'avgPrice');
    const deposit = average(jeonse, 'avgDeposit');
    if (sale !== null) headline = formatWon(sale);
    if (sale !== null) parts.push(`매매 ${formatWon(sale)}`);
    if (deposit !== null) parts.push(`전세 ${formatWon(deposit)}`);
  } else if (dealType === 'JEONSE') {
    const deposit = average(prices, 'avgDeposit');
    if (deposit !== null) {
      headline = formatWon(deposit);
      parts.push(`전세 ${formatWon(deposit)}`);
    }
  } else {
    const deposit = average(prices, 'avgDeposit');
    const rent = average(prices, 'avgMonthlyRent');
    if (deposit !== null && rent !== null) headline = `보증금 ${formatWon(deposit)} / 월 ${formatWon(rent)}`;
    if (deposit !== null) parts.push(`보증금 ${formatWon(deposit)}`);
    if (rent !== null) parts.push(`월세 ${formatWon(rent)}`);
  }
  const caption = parts.length
    ? `최근 ${RECENT_MONTHS}개월 평균 · ${band.label} · ${parts.join(' · ')}`
    : `최근 ${RECENT_MONTHS}개월 ${getDealTypeLabel(dealType)} 거래 없음 · ${band.label}`;
  return { endMonth, headline, caption, rate: changeRate(completedMonthly(prices.monthly, now), dealType) };
};

// 원 → "12억 3,000만" / "12억 500만" / "9억" / "8,000만" / "280만" (만원 아래는 반올림)
export const formatWon = (won) => {
  const manwon = Math.round(won / 10000);
  const eok = Math.floor(manwon / 10000);
  const rest = manwon % 10000;
  if (eok === 0) return `${rest.toLocaleString('ko-KR')}만`;
  return rest === 0 ? `${eok}억` : `${eok}억 ${rest.toLocaleString('ko-KR')}만`;
};
