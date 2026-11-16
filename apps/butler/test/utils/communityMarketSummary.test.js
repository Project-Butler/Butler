import { describe, expect, it } from 'vitest';
import { AREA_BANDS, chartMonths, completedMonthly, formatChange, lastCompleteMonth, recentSummary, roundAverage } from '../../src/landlord/web/utils/communityMarketSummary';

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
