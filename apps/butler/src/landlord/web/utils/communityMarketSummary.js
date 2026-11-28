// 시세 화면 계산 — 시세 응답(api-contract "시세" 모양)에서 대표 숫자 · 증감률 · 차트 값을 뽑는다. 순수 함수.
// 데이터는 시세 API(국토교통부 실거래가, GET /market-prices/complexes/:complexId)의 응답이다.
//
// ┌ 면적대 칩 — 그 단지가 가진 면적대만(#274) ─────────────────────────────────────────────────────────────────────┐
// │ 규칙은 pickAreaBands 하나 — 웹 시세 · 웹 브리핑 · 앱 시세 · 앱 브리핑이 같이 쓴다(areaBandsOf(building))                  │
// │ 보이는 칩   그 단지 실거래에 나온 구간(my-buildings dealAreas — 보관 13개월, 매매 · 전세 · 월세 합침) + 내 호실 구간(unitAreas) │
// │ 정보 없음   dealAreas 가 비면(수집 전 · 연결 전 · 0건) 4개 모두 — 예전 그대로                                             │
// │ 기본 선택   내 호실 구간(호실이 많은 쪽, 같으면 큰 쪽) → 없으면 60–85 가 보일 때 60–85 → 아니면 보이는 칩 중 첫째              │
// │ 사라지면    고른 칩이 보이는 칩에서 빠지면(건물 목록을 다시 받아서) 기본 선택으로(resolveAreaBand)                           │
// │ 하나만     칩 대신 글자 "전용 60㎡ 이하"(singleAreaBandText) — 고를 것이 없는 칩 묶음은 누를 수 있는 조작처럼 보인다           │
// │ 왜: 그 단지에 없는 크기의 칩을 누르면 "… 거래가 없습니다" 가 나와 거래가 뜸한 것처럼 읽혔다(11/28 중계그린 — 60㎡ 이하만).  │
// │     유형을 합쳐 세는 것은 거래 유형을 바꿔도 칩이 바뀌지 않게. 구간 경계는 여기(AREA_BANDS) 한 곳 — 서버는 면적만 준다       │
// └──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
//
// ┌ 일부만 모았을 때(#267 2차) ─────────────────────────────────────────────────────────────────────────────┐
// │ 원칙: 모은 달의 사실(거래 · 월별 평균)은 다 보이고, 빠진 달이 들어가면 틀리는 숫자만 조건이 맞을 때 보인다          │
// │ 못 모은 달 = monthly 에서 collected 가 false 인 달(일부 모음 응답에만 있다 — READY 는 칸이 없고 모두 모은 달)          │
// │ 최근 3개월 평균   그 3개월(지난달까지)이 모두 모은 달일 때만. 아니면 큰 숫자 없이 "최근 3개월 평균은 모으는 중"      │
// │ 직전 3개월 대비   최근 3개월 + 직전 3개월, 6개월이 모두 모은 달일 때만. 아니면 증감 줄을 숨긴다                     │
// │ 대신 계산 안 함   "모은 달 중 가장 최근 3개월" 로 바꿔 계산하지 않는다 — 기간이 바뀌어 보여 오해를 산다              │
// │ 왜: 빠진 달을 0 이나 "거래 없음" 처럼 넘기면 평균 · 증감이 조용히 틀린다(거래 없는 달은 원래 평균에서 빠지는 게 맞다) │
// │ 차트            못 모은 달은 선을 끊고 비운다(점선으로 잇지 않음) — 거래 없는 달(점선)과 구분(chartSeries)           │
// │                 줄마다 자기 응답 기준(비교 선도), 띠 · 범례는 주 선만 — 글자는 "매매 수집 중"(missingMonthsLabel)       │
// └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
import { AVERAGE_COLLECTING_TEXT, missingMonthsLabel } from './communityMarketCollecting';

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

// 내 호실 구간이 없을 때 먼저 고르는 구간(보일 때만) — 예전 기본값 그대로
const FALLBACK_BAND_KEY = '60to85';

// 면적대 칩(맨 위 상자 "면적대 칩"). myAreas = 내 호실 전용면적(unitAreas), dealAreas = 그 단지 실거래 전용면적(my-buildings dealAreas).
// 반환 { bands: 보이는 칩(AREA_BANDS 순서), owned: 내 호실이 걸친 구간 key(점 · 안내), defaultKey: 기본 선택 — 늘 bands 안에 있다 }
export const pickAreaBands = (myAreas = [], dealAreas = []) => {
  const counts = AREA_BANDS.map((band) => myAreas.filter((area) => band.contains(area)).length);
  const owned = new Set(AREA_BANDS.filter((_band, index) => counts[index] > 0).map((band) => band.key));
  const dealt = new Set(AREA_BANDS.filter((band) => dealAreas.some((area) => band.contains(area))).map((band) => band.key));
  const bands = dealt.size === 0 ? AREA_BANDS : AREA_BANDS.filter((band) => dealt.has(band.key) || owned.has(band.key));
  // 내 호실 구간 — 호실이 많은 구간, 같으면 면적이 큰 구간
  let active = -1;
  counts.forEach((count, index) => {
    if (count > 0 && (active === -1 || count >= counts[active])) active = index;
  });
  let defaultKey;
  if (active !== -1) defaultKey = AREA_BANDS[active].key;
  else if (bands.some((band) => band.key === FALLBACK_BAND_KEY)) defaultKey = FALLBACK_BAND_KEY;
  else defaultKey = bands[0].key;
  return { bands, owned, defaultKey };
};

// 건물(my-buildings 한 줄)의 칩 — 화면 넷이 이것으로 부른다(없는 칸은 빈 목록: 예전 서버 · 면적 없는 호실)
export const areaBandsOf = (building) => pickAreaBands(building.unitAreas ?? [], building.dealAreas ?? []);

// 지금 칩 — 고른 key 가 보이는 칩에 없으면(사라지면) 기본 선택
export const resolveAreaBand = ({ bands, defaultKey }, key) =>
  bands.find((band) => band.key === key) ?? bands.find((band) => band.key === defaultKey);

// 칩이 하나만 남았을 때 칩 대신 보이는 글자
export const singleAreaBandText = (band) => `전용 ${band.label}`;

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


// ===== 모은 달인지(#267 2차) =====
// 그 달을 모았는지 — monthly 에 collected false 로 있는 달만 못 모은 달(READY 는 칸이 없고, 거래 없는 달은 줄이 없다 → 모은 달)
export const isCollectedMonth = (monthly, yearMonth) => monthly.find((row) => row.yearMonth === yearMonth)?.collected !== false;
// endMonth 까지 거꾸로 count 개월이 모두 모은 달인지
export const allCollected = (monthly, endMonth, count) =>
  Array.from({ length: count }, (_, index) => shiftMonth(endMonth, -index)).every((month) => isCollectedMonth(monthly, month));

// 차트 한 줄의 값 — values(반올림한 평균, 거래 없는 달 · 못 모은 달은 null) · missing(못 모은 달 true, 그 줄의 응답 기준) · missingLabel("매매 수집 중").
// months 와 같은 길이. 비교 선(매매 화면의 전세 선)도 자기 응답으로 만든다 — 매매와 전월세는 따로 모으므로 못 모은 달이 다를 수 있다
export const chartSeries = (data, months, dealType) => ({
  values: months.map((month) => {
    const row = data.monthly.find((item) => item.yearMonth === month);
    return row && row.collected !== false ? chartValue(row, dealType) : null;
  }),
  missing: months.map((month) => !isCollectedMonth(data.monthly, month)),
  missingLabel: missingMonthsLabel(getDealTypeLabel(dealType)),
});

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
// 일부만 모았으면(맨 위 상자): 최근 3개월이 다 모이지 않았으면 headline 없이 caption "최근 3개월 평균은 모으는 중 · 60–85㎡" · 증감 없음,
// 6개월이 다 모이지 않았으면 증감만 없음. 전세 덧붙임도 전세 응답의 최근 3개월이 다 모였을 때만
export const recentSummary = ({ prices, jeonse = null, dealType, band, now = new Date() }) => {
  const endMonth = lastCompleteMonth(now);
  const recentCovered = (data) => allCollected(data.monthly, endMonth, RECENT_MONTHS);
  if (!recentCovered(prices)) {
    return { endMonth, headline: null, caption: `${AVERAGE_COLLECTING_TEXT} · ${band.label}`, rate: null, changeText: null, averagePending: true };
  }
  const average = (data, field) => (data && recentCovered(data) ? roundAverage(recentAverage(data.monthly, endMonth, field), field) : null);
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
  // 증감은 최근 3개월 + 직전 3개월이 모두 모은 달일 때만
  const rate = allCollected(prices.monthly, endMonth, RECENT_MONTHS * 2) ? periodChange(prices.monthly, endMonth, MONTHLY_FIELD[dealType]) : null;
  return { endMonth, headline, caption, rate, changeText: formatChange(rate), averagePending: false };
};

// 원 → "12억 3,000만" / "12억 500만" / "9억" / "8,000만" / "280만" (만원 아래는 반올림)
export const formatWon = (won) => {
  const manwon = Math.round(won / 10000);
  const eok = Math.floor(manwon / 10000);
  const rest = manwon % 10000;
  if (eok === 0) return `${rest.toLocaleString('ko-KR')}만`;
  return rest === 0 ? `${eok}억` : `${eok}억 ${rest.toLocaleString('ko-KR')}만`;
};
