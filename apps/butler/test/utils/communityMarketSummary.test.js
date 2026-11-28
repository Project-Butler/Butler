import { describe, expect, it } from 'vitest';
import {
  allCollected,
  AREA_BANDS,
  areaBandsOf,
  chartMonths,
  chartSeries,
  completedMonthly,
  formatChange,
  isCollectedMonth,
  lastCompleteMonth,
  pickAreaBands,
  recentSummary,
  resolveAreaBand,
  roundAverage,
  singleAreaBandText,
} from '../../src/landlord/web/utils/communityMarketSummary';

// 한국 시간 2026-11-17 12:00 — 이번 달은 2026-11, 지난달은 2026-10
const NOW = new Date('2026-11-17T03:00:00Z');
const BAND = AREA_BANDS.find((band) => band.key === '60to85');
const row = (yearMonth, dealCount, values) => ({ yearMonth, dealCount, avgPrice: null, minPrice: null, maxPrice: null, avgDeposit: null, avgMonthlyRent: null, ...values });

describe('이번 달 빼기', () => {
  it('지난달은 한국 날짜 기준(UTC 11/30 15:00 = 한국 12/1 → 지난달 11월)', () => {
    expect(lastCompleteMonth(NOW)).toBe('2026-10');
    expect(lastCompleteMonth(new Date('2026-11-30T14:59:00Z'))).toBe('2026-10');
    expect(lastCompleteMonth(new Date('2026-11-30T15:00:00Z'))).toBe('2026-11');
  });

  it('monthly 에서 이번 달 행을 뺀다', () => {
    const monthly = [row('2026-09', 1, { avgPrice: 1 }), row('2026-10', 1, { avgPrice: 2 }), row('2026-11', 1, { avgPrice: 3 })];
    expect(completedMonthly(monthly, NOW).map((item) => item.yearMonth)).toEqual(['2026-09', '2026-10']);
  });

  it('차트 달: 지난달까지 12개월(서버가 13개월을 모아 다 찬다), 처음 모으는 중이라 모은 기간이 짧으면 그만큼만', () => {
    expect(chartMonths('2025-11', NOW)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(chartMonths(null, NOW)).toHaveLength(12);
    expect(chartMonths('2026-02', NOW)).toHaveLength(9);
  });
});

describe('평균 반올림 · 증감 문구', () => {
  it('매매가 · 보증금 평균은 백만 원 단위, 월세 금액은 그대로', () => {
    expect(roundAverage(1059670000, 'avgPrice')).toBe(1060000000); // 10억 5,967만 → 10억 6,000만
    expect(roundAverage(459600000, 'avgDeposit')).toBe(460000000);
    expect(roundAverage(2500000, 'avgMonthlyRent')).toBe(2500000);
    expect(roundAverage(null, 'avgPrice')).toBeNull();
  });

  it('증감은 색 없이 ▲▼ 와 비교 대상', () => {
    expect(formatChange(-5.94)).toBe('직전 3개월보다 ▼5.9%');
    expect(formatChange(3.21)).toBe('직전 3개월보다 ▲3.2%');
    expect(formatChange(0.04)).toBe('직전 3개월과 같음');
    expect(formatChange(null)).toBeNull();
  });
});

describe('대표 숫자 · 설명 한 줄', () => {
  const sale = { monthly: [row('2026-07', 4, { avgPrice: 2000000000 }), row('2026-08', 1, { avgPrice: 2200000000 }), row('2026-10', 2, { avgPrice: 2400000000 }), row('2026-11', 1, { avgPrice: 3000000000 })] };
  const jeonse = { monthly: [row('2026-09', 2, { avgDeposit: 1100000000 }), row('2026-10', 2, { avgDeposit: 1200000000 }), row('2026-11', 5, { avgDeposit: 2000000000 })] };

  it('매매: 최근 3개월(8~10월, 이번 달 빼고) 건수 가중 평균(백만 원 반올림) · 설명은 면적대와 전세 평균만', () => {
    const summary = recentSummary({ prices: sale, jeonse, dealType: 'SALE', band: BAND, now: NOW });
    // (22억 × 1 + 24억 × 2) ÷ 3 = 23억 3,333만 → 23억 3,300만 · 전세 (11억 × 2 + 12억 × 2) ÷ 4 = 11억 5,000만
    expect(summary.endMonth).toBe('2026-10');
    expect(summary.headline).toBe('23억 3,300만');
    expect(summary.caption).toBe('최근 3개월 평균 · 60–85㎡ · 전세 11억 5,000만');
    // 증감: 최근 3개월(8~10월) 평균 ÷ 직전 3개월(5~7월 — 7월 20억 4건) 평균 − 1. 이번 달 30억은 넣지 않는다
    expect(summary.rate).toBeCloseTo((7000000000 / 3 / 2000000000 - 1) * 100, 5);
    expect(summary.changeText).toBe('직전 3개월보다 ▲16.7%');
  });

  it('월세: 큰 숫자 "보증금 X / 월 Y", 설명은 면적대만(되풀이하지 않음)', () => {
    const monthly = { monthly: [row('2026-10', 2, { avgDeposit: 100000000, avgMonthlyRent: 2500000 })] };
    const summary = recentSummary({ prices: monthly, dealType: 'MONTHLY', band: BAND, now: NOW });
    expect(summary.headline).toBe('보증금 1억 / 월 250만');
    expect(summary.caption).toBe('최근 3개월 평균 · 60–85㎡');
    expect(summary.changeText).toBeNull(); // 직전 3개월에 거래 없음
  });

  it('최근 3개월에 거래가 없으면(이번 달만 있어도) 숫자 없이 "거래 없음"', () => {
    const summary = recentSummary({ prices: { monthly: [row('2026-06', 1, { avgPrice: 1 }), row('2026-11', 1, { avgPrice: 2 })] }, dealType: 'SALE', band: BAND, now: NOW });
    expect(summary.headline).toBeNull();
    expect(summary.caption).toBe('최근 3개월 매매 거래 없음 · 60–85㎡');
  });
});

describe('일부만 모았을 때 — 빠진 달 때문에 틀릴 수 있는 숫자만 막는다 (#267 2차)', () => {
  const MONTHS = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
  // 일부 모음 응답 모양: 요청 기간의 모든 달 + collected. 거래 있는 달은 deals 에서, 모은 달인데 거래 없으면 0, 못 모은 달은 null
  const partial = (deals, missing, field = 'avgPrice') => ({
    collectionStatus: 'COLLECTING',
    monthly: MONTHS.map((yearMonth) => {
      if (missing.includes(yearMonth)) return { ...row(yearMonth, null, {}), collected: false };
      const deal = deals[yearMonth];
      return deal ? { ...row(yearMonth, deal[0], { [field]: deal[1] }), collected: true } : { ...row(yearMonth, 0, {}), collected: true };
    }),
  });
  const DEALS = { '2026-05': [1, 2000000000], '2026-07': [1, 2000000000], '2026-08': [1, 2200000000], '2026-10': [2, 2400000000], '2026-11': [1, 3000000000] };

  it('오래된 달만 빠짐(최근 6개월 모두 모음): 평균 · 증감 그대로 — 다 모았을 때와 같은 숫자', () => {
    const summary = recentSummary({ prices: partial(DEALS, MONTHS.slice(0, 5)), dealType: 'SALE', band: BAND, now: NOW });
    expect(summary.headline).toBe('23억 3,300만');
    expect(summary.caption).toBe('최근 3개월 평균 · 60–85㎡');
    // 직전 3개월(5~7월) = (20억 + 20억) ÷ 2
    expect(summary.changeText).toBe('직전 3개월보다 ▲16.7%');
    expect(summary.averagePending).toBe(false);
  });

  it('최근 3개월 중 하나라도 빠지면 큰 숫자 없이 "최근 3개월 평균은 모으는 중" · 증감도 숨김 — 모은 다른 달로 대신 계산하지 않는다', () => {
    for (const missingMonth of ['2026-08', '2026-09', '2026-10']) {
      const summary = recentSummary({ prices: partial(DEALS, [missingMonth]), dealType: 'SALE', band: BAND, now: NOW });
      expect(summary.headline).toBeNull();
      expect(summary.caption).toBe('최근 3개월 평균은 모으는 중 · 60–85㎡');
      expect([summary.rate, summary.changeText]).toEqual([null, null]);
      expect(summary.averagePending).toBe(true);
      expect(summary.endMonth).toBe('2026-10'); // 기간은 그대로(지난달까지)
    }
    // 이번 달(11월)만 빠지면 평균 · 증감은 그대로(지난달까지로 계산하므로)
    expect(recentSummary({ prices: partial(DEALS, ['2026-11']), dealType: 'SALE', band: BAND, now: NOW }).headline).toBe('23억 3,300만');
  });

  it('최근 3개월은 다 있고 직전 3개월 중 하나가 빠지면 평균은 보이고 증감만 숨김', () => {
    for (const missingMonth of ['2026-05', '2026-06', '2026-07']) {
      const summary = recentSummary({ prices: partial(DEALS, [missingMonth]), dealType: 'SALE', band: BAND, now: NOW });
      expect(summary.headline).toBe('23억 3,300만');
      expect([summary.rate, summary.changeText]).toEqual([null, null]);
    }
    // 직전 3개월 바로 앞(4월)이 빠진 것은 상관없다
    expect(recentSummary({ prices: partial(DEALS, ['2026-04']), dealType: 'SALE', band: BAND, now: NOW }).changeText).toBe('직전 3개월보다 ▲16.7%');
  });

  it('매매 화면의 전세 평균 덧붙임도 전세 응답의 최근 3개월이 다 모였을 때만', () => {
    const jeonseDeals = { '2026-09': [2, 1100000000], '2026-10': [2, 1200000000] };
    const full = recentSummary({ prices: partial(DEALS, []), jeonse: partial(jeonseDeals, [], 'avgDeposit'), dealType: 'SALE', band: BAND, now: NOW });
    expect(full.caption).toBe('최근 3개월 평균 · 60–85㎡ · 전세 11억 5,000만');
    const jeonseMissing = recentSummary({ prices: partial(DEALS, []), jeonse: partial(jeonseDeals, ['2026-08'], 'avgDeposit'), dealType: 'SALE', band: BAND, now: NOW });
    expect(jeonseMissing.caption).toBe('최근 3개월 평균 · 60–85㎡');
  });

  it('모은 달인지: collected false 인 달만 못 모은 달(READY 는 칸이 없고, 줄이 없는 달 = 거래 없음 = 모은 달)', () => {
    const data = partial(DEALS, ['2026-09']);
    expect(isCollectedMonth(data.monthly, '2026-09')).toBe(false);
    expect(isCollectedMonth(data.monthly, '2026-08')).toBe(true);
    expect(isCollectedMonth([row('2026-10', 1, { avgPrice: 1 })], '2026-09')).toBe(true);
    expect(allCollected(data.monthly, '2026-10', 3)).toBe(false);
    expect(allCollected(data.monthly, '2026-08', 3)).toBe(true);
  });

  it('차트 값: 못 모은 달은 null + missing, 모은 달의 거래 없음은 null 이지만 missing 아님', () => {
    const months = ['2026-07', '2026-08', '2026-09', '2026-10'];
    const { values, missing } = chartSeries(partial(DEALS, ['2026-09']), months, 'SALE');
    expect(values).toEqual([2000000000, 2200000000, null, 2400000000]);
    expect(missing).toEqual([false, false, true, false]);
    // 모은 달인데 거래 없음(06월) — 값 null, missing false
    expect(chartSeries(partial(DEALS, []), ['2026-06'], 'SALE')).toEqual({ values: [null], missing: [false], missingLabel: '매매 수집 중' });
    // 띠 · 범례 글자는 그 줄의 거래 이름(DEAL_TYPES) + "수집 중"
    expect(chartSeries(partial({}, [], 'avgDeposit'), ['2026-06'], 'JEONSE').missingLabel).toBe('전세 수집 중');
    expect(chartSeries(partial({}, [], 'avgMonthlyRent'), ['2026-06'], 'MONTHLY').missingLabel).toBe('월세 수집 중');
  });
});

// #274 — 칩 = 그 단지 실거래 구간(dealAreas) + 내 호실 구간(unitAreas), 정보 없으면 4개. 면적은 로컬 실제 단지의 전용면적
describe('면적대 칩 — 그 단지가 가진 면적대만 (#274)', () => {
  const keys = ({ bands }) => bands.map((band) => band.key);
  const PARKRIO = [35.24, 59.98, 84.79, 144.77]; // 파크리오: 85–105 거래 없음
  const JUNGGYE = [39.6, 49.85, 59.39]; // 중계그린: 60㎡ 이하만

  it('칩 3개(파크리오 모양) — 거래가 없는 85–105 는 빠지고 순서는 그대로', () => {
    expect(keys(pickAreaBands([84.79], PARKRIO))).toEqual(['le60', '60to85', 'gt105']);
  });

  it('하나만 남음(중계그린 모양) — 칩 하나, 글자는 "전용 60㎡ 이하"', () => {
    const result = pickAreaBands([], JUNGGYE);
    expect(keys(result)).toEqual(['le60']);
    expect(result.defaultKey).toBe('le60');
    expect(singleAreaBandText(result.bands[0])).toBe('전용 60㎡ 이하');
  });

  it('거래 정보 없음(빈 목록 · 칸 없음) — 지금처럼 4개, 기본은 내 호실 구간 또는 60–85', () => {
    expect(keys(pickAreaBands([], []))).toEqual(['le60', '60to85', '85to105', 'gt105']);
    expect(pickAreaBands([], []).defaultKey).toBe('60to85');
    expect(pickAreaBands([101.2], []).defaultKey).toBe('85to105');
    expect(keys(areaBandsOf({ unitAreas: [84.79] }))).toHaveLength(4); // 예전 서버(dealAreas 없음)
    expect(areaBandsOf({}).defaultKey).toBe('60to85'); // 면적 칸이 다 없어도
  });

  it('내 호실 구간에 거래가 없어도 그 칩은 보이고(점) 기본으로 고른다', () => {
    const result = pickAreaBands([101.2], PARKRIO);
    expect(keys(result)).toEqual(['le60', '60to85', '85to105', 'gt105']);
    expect([...result.owned]).toEqual(['85to105']);
    expect(result.defaultKey).toBe('85to105');
    // 중계그린인데 내 호실이 84㎡ → 60 이하(거래) + 60–85(내 호실) 둘
    expect(keys(pickAreaBands([84.0], JUNGGYE))).toEqual(['le60', '60to85']);
  });

  it('기본 선택 세 단계 — ① 내 호실 구간(호실이 많은 쪽, 같으면 큰 쪽) ② 없으면 60–85 가 보일 때 60–85 ③ 아니면 보이는 칩 중 첫째', () => {
    expect(pickAreaBands([59.9, 84.79, 84.5], PARKRIO).defaultKey).toBe('60to85'); // ① 호실 많은 쪽
    expect(pickAreaBands([59.9, 144.77], PARKRIO).defaultKey).toBe('gt105'); // ① 같으면 큰 쪽
    expect(pickAreaBands([], PARKRIO).defaultKey).toBe('60to85'); // ②
    expect(pickAreaBands([], [59.9, 120.36]).defaultKey).toBe('le60'); // ③ 60–85 없음 → 첫째
    expect(pickAreaBands([], [64.26, 158.61]).defaultKey).toBe('60to85'); // ② (송파한양1차 — 60 이하 없음)
    expect(pickAreaBands([], [95.0, 158.61]).defaultKey).toBe('85to105'); // ③
  });

  it('고른 칩이 사라지면 기본 선택으로, 남아 있으면 그대로', () => {
    const before = pickAreaBands([], PARKRIO);
    expect(resolveAreaBand(before, 'gt105').key).toBe('gt105');
    const after = pickAreaBands([], [59.98, 84.79]); // 건물 목록을 다시 받아 105 초과가 빠짐
    expect(resolveAreaBand(after, 'gt105').key).toBe('60to85');
    expect(resolveAreaBand(pickAreaBands([], JUNGGYE), '60to85').key).toBe('le60');
  });

  it('경계값은 아래 구간(60㎡ 는 60 이하, 85㎡ 는 60–85) — 서버 areaRange 와 같다', () => {
    expect(keys(pickAreaBands([], [60]))).toEqual(['le60']);
    expect(keys(pickAreaBands([], [85, 105]))).toEqual(['60to85', '85to105']);
  });
});
