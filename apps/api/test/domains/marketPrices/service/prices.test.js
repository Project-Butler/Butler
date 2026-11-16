import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseMarketQuery, toMonthly } from '../../../../src/domains/marketPrices/service/prices.js';

const NOW = new Date('2026-11-17T03:00:00Z');
const row = (yearMonth, values) => ({ contractYearMonth: yearMonth, price: null, deposit: null, monthlyRent: null, ...values });

describe('시세 조회 조건', () => {
  test('dealType 필수, 기본 기간은 이번 달까지 12개월, 면적은 숫자', () => {
    assert.deepEqual(parseMarketQuery({ dealType: 'SALE' }, NOW), { dealType: 'SALE', areaMin: null, areaMax: null, from: '2025-12', to: '2026-11' });
    assert.deepEqual(parseMarketQuery({ dealType: 'MONTHLY', areaMin: '60', areaMax: '85', toYearMonth: '2026-06' }, NOW), {
      dealType: 'MONTHLY',
      areaMin: 60,
      areaMax: 85,
      from: '2025-07',
      to: '2026-06',
    });
  });

  test('잘못된 입력은 400 MARKET_PRICE_INVALID_QUERY(어느 칸인지 details 에)', () => {
    const cases = [
      [{}, 'dealType'],
      [{ dealType: 'RENT' }, 'dealType'],
      [{ dealType: 'SALE', areaMin: 'abc' }, 'areaMin'],
      [{ dealType: 'SALE', areaMin: '-1' }, 'areaMin'],
      [{ dealType: 'SALE', areaMin: '90', areaMax: '80' }, 'areaMin'],
      [{ dealType: 'SALE', fromYearMonth: '2026-13' }, 'fromYearMonth'],
      [{ dealType: 'SALE', fromYearMonth: '2026-10', toYearMonth: '2026-09' }, 'fromYearMonth'],
    ];
    for (const [query, field] of cases) {
      assert.throws(() => parseMarketQuery(query, NOW), (error) => {
        assert.equal(error.code, 'MARKET_PRICE_INVALID_QUERY');
        assert.equal(error.httpStatus, 400);
        assert.equal(error.details[0].field, field);
        return true;
      });
    }
  });
});

describe('달별 집계', () => {
  test('매매: 평균(반올림) · 최저 · 최고, 거래 있는 달만 오름차순', () => {
    const monthly = toMonthly(
      [row('2026-10', { price: 100n }), row('2026-08', { price: 300n }), row('2026-10', { price: 201n })],
      'SALE',
    );
    assert.deepEqual(monthly, [
      { yearMonth: '2026-08', dealCount: 1, avgPrice: 300, minPrice: 300, maxPrice: 300, avgDeposit: null, avgMonthlyRent: null },
      { yearMonth: '2026-10', dealCount: 2, avgPrice: 151, minPrice: 100, maxPrice: 201, avgDeposit: null, avgMonthlyRent: null },
    ]);
  });

  test('전세는 avgDeposit, 월세는 avgDeposit · avgMonthlyRent(나머지 null)', () => {
    assert.deepEqual(toMonthly([row('2026-10', { deposit: 500000000n })], 'JEONSE'), [
      { yearMonth: '2026-10', dealCount: 1, avgPrice: null, minPrice: null, maxPrice: null, avgDeposit: 500000000, avgMonthlyRent: null },
    ]);
    assert.deepEqual(toMonthly([row('2026-10', { deposit: 100000000n, monthlyRent: 2000000n }), row('2026-10', { deposit: 200000000n, monthlyRent: 3000000n })], 'MONTHLY'), [
      { yearMonth: '2026-10', dealCount: 2, avgPrice: null, minPrice: null, maxPrice: null, avgDeposit: 150000000, avgMonthlyRent: 2500000 },
    ]);
    assert.deepEqual(toMonthly([], 'SALE'), []);
  });
});
