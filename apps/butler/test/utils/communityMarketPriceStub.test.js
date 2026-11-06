import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMarketPricesStub } from '../../src/utils/communityMarketPriceStub';

// 예시 시세의 날짜는 오늘(한국 날짜)의 지난달이 마지막 달이 되게 옮겨진다. 금액 · 건수는 그대로.
const JAMSIL = '0c000000-0000-4000-8000-000000000001';
const HAEUNDAE = '0c000000-0000-4000-8000-000000000002';

describe('getMarketPricesStub 날짜', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('11/05 에 열면 지난달(10월)까지 12개월 — 금액은 그대로', async () => {
    vi.setSystemTime(new Date('2026-11-05T03:00:00Z'));
    const data = await getMarketPricesStub({ complexId: JAMSIL, dealType: 'SALE', areaMin: 60, areaMax: 85 });

    expect(data.monthly.map((row) => row.yearMonth)).toEqual([
      '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04',
      '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
    ]);
    expect(data.asOf).toBe('2026-10-28');
    expect(data.coveredFromYearMonth).toBe('2025-11');
    expect(data.recentDeals[0]).toMatchObject({ contractDate: '2026-10-21', price: 1230000000 });
    expect(data.monthly.at(-1)).toMatchObject({ dealCount: 3, avgPrice: 1205000000 });
  });

  it('달은 한국 날짜로 판단한다 — UTC 로 10/31 이어도 한국이 11/01 이면 10월까지', async () => {
    vi.setSystemTime(new Date('2026-10-31T15:30:00Z'));
    const data = await getMarketPricesStub({ complexId: JAMSIL, dealType: 'JEONSE', areaMin: 60, areaMax: 85 });

    expect(data.monthly.at(-1).yearMonth).toBe('2026-10');
    expect(data.asOf).toBe('2026-10-28');
  });

  it('옮긴 달에 없는 날은 그 달 말일로(7/29 → 2월 28일)', async () => {
    vi.setSystemTime(new Date('2027-05-10T03:00:00Z'));
    const data = await getMarketPricesStub({ complexId: HAEUNDAE, dealType: 'SALE', areaMin: 60, areaMax: 85 });

    expect(data.recentDeals.map((deal) => deal.contractDate)).toEqual(['2027-03-24', '2027-02-28', '2027-01-24', '2026-12-27', '2026-11-21']);
    // 해운대 60–85㎡ 매매는 마지막 달에 거래가 없게 적어 두었다 — 옮긴 뒤에도 그 앞달에서 끝난다
    expect(data.asOf).toBe('2027-04-28');
    expect(data.monthly.at(-1).yearMonth).toBe('2027-03');
  });

  it('표에 없는 단지는 날짜 없이 수집 중', async () => {
    vi.setSystemTime(new Date('2026-11-05T03:00:00Z'));
    const data = await getMarketPricesStub({ complexId: 'other', dealType: 'SALE', areaMin: 60, areaMax: 85 });

    expect(data).toMatchObject({ collectionStatus: 'COLLECTING', asOf: null, coveredFromYearMonth: null, monthly: [] });
  });
});
