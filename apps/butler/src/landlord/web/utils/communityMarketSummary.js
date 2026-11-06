// 시세 화면 계산 — 시세 응답(api-contract "시세" 모양)에서 대표 숫자 · 증감률 · 차트 값을 뽑는다. 순수 함수.
// 데이터 출처(지금 예시 스텁 → 나중에 플랫폼 API)가 바뀌어도 그대로 쓴다.

export const DEAL_TYPES = [
  { value: 'SALE', label: '매매' },
  { value: 'JEONSE', label: '전세' },
  { value: 'MONTHLY', label: '월세' },
];
export const getDealTypeLabel = (dealType) => DEAL_TYPES.find((type) => type.value === dealType)?.label ?? dealType;

// 전용면적 구간(칩 문구). 면적이 경계값이면 아래 구간(60㎡ 는 "60㎡ 이하"). areaMin · areaMax 는 규격 쿼리 값.
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

// 기준월(asOf 의 달)까지 12개월: ['2025-10', …, '2026-09']
export const monthsEnding = (asOf, count = 12) => {
  const last = asOf.slice(0, 7);
  return Array.from({ length: count }, (_value, index) => shiftMonth(last, index - (count - 1)));
};

// 증감률(%): 거래가 있는 마지막 달 평균 ÷ 그 3개월 전 달 평균 − 1. 둘 중 하나라도 없으면 null.
export const changeRate = (monthly, dealType) => {
  const last = monthly[monthly.length - 1];
  if (!last) return null;
  const base = monthly.find((row) => row.yearMonth === shiftMonth(last.yearMonth, -3));
  const [now, before] = [monthlyValue(last, dealType), base && monthlyValue(base, dealType)];
  return now && before ? ((now - before) / before) * 100 : null;
};

// 최근 3개월(기준월 포함) 평균 — 건수 가중. 거래가 없으면 null.
export const recentAverage = (monthly, asOf, field) => {
  const from = shiftMonth(asOf.slice(0, 7), -2);
  const rows = monthly.filter((row) => row.yearMonth >= from && row[field] !== null);
  const count = rows.reduce((sum, row) => sum + row.dealCount, 0);
  return count === 0 ? null : rows.reduce((sum, row) => sum + row[field] * row.dealCount, 0) / count;
};

// 원 → "12억 3,000만" / "12억 500만" / "9억" / "8,000만" / "280만" (만원 아래는 반올림)
export const formatWon = (won) => {
  const manwon = Math.round(won / 10000);
  const eok = Math.floor(manwon / 10000);
  const rest = manwon % 10000;
  if (eok === 0) return `${rest.toLocaleString('ko-KR')}만`;
  return rest === 0 ? `${eok}억` : `${eok}억 ${rest.toLocaleString('ko-KR')}만`;
};
