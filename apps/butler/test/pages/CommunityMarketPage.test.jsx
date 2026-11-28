import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityPage } from '../../src/landlord/web/pages/CommunityPage';

const api = vi.hoisted(() => ({
  getMyBuildings: vi.fn(),
  getCommunityProfile: vi.fn(),
  getCommunityPostList: vi.fn(),
  getCommunityPollList: vi.fn(),
  getCommunityNewsList: vi.fn(),
  getComplexMarketPrices: vi.fn(),
}));

vi.mock('@butler/api-client', () => ({
  ...api,
  queryKey: {
    COMMUNITY_MY_BUILDINGS: 'community_my_buildings',
    COMMUNITY_PROFILE: 'community_profile',
    MARKET_PRICES: 'market_prices',
  },
}));

const REGION = { legalDongCode: '1171010200', dongName: '신천동', fullName: '서울특별시 송파구 신천동' };
const BUILDING = {
  complexId: 'complex-park',
  name: '파크리오',
  legalDongCode: REGION.legalDongCode,
  regionName: REGION.fullName,
  unitCount: 1,
  unitAreas: [84.79],
  memberCount: 3,
  verificationStatus: 'VERIFIED',
  verifyPropertyId: null,
};
// 시세 API 응답(연동 규격 2장 시세 모양, 금액은 원) — 숫자는 11/17 실제 수집한 신천동 거래 규모로 지었다
const ready = ({ dealType, areaMin = 60, areaMax = 85 }) => {
  const sale = dealType === 'SALE';
  const monthlyRent = dealType === 'MONTHLY';
  return {
    scope: 'COMPLEX', complexId: BUILDING.complexId, legalDongCode: REGION.legalDongCode, dealType, areaMin, areaMax,
    coveredFromYearMonth: '2025-11', asOf: '2026-11-17', source: '국토교통부 실거래가', collectionStatus: 'READY', jobId: null,
    monthly: [
      { yearMonth: '2026-08', dealCount: 5, avgPrice: sale ? 2310000000 : null, minPrice: sale ? 2250000000 : null, maxPrice: sale ? 2380000000 : null, avgDeposit: sale ? null : 1100000000, avgMonthlyRent: monthlyRent ? 2500000 : null },
      { yearMonth: '2026-10', dealCount: 7, avgPrice: sale ? 2405000000 : null, minPrice: sale ? 2330000000 : null, maxPrice: sale ? 2470000000 : null, avgDeposit: sale ? null : 1150000000, avgMonthlyRent: monthlyRent ? 2600000 : null },
    ],
    recentDeals: [
      { contractDate: '2026-10-28', dealType, complexName: '파크리오', exclusiveArea: 84.79, floor: 15, price: sale ? 2470000000 : null, deposit: sale ? null : 1200000000, monthlyRent: monthlyRent ? 2800000 : null },
      { contractDate: '2026-10-12', dealType, complexName: '파크리오', exclusiveArea: 84.9, floor: 7, price: sale ? 2330000000 : null, deposit: sale ? null : 1100000000, monthlyRent: monthlyRent ? 2400000 : null },
    ],
  };
};
const collecting = { ...ready({ dealType: 'SALE' }), coveredFromYearMonth: null, asOf: null, collectionStatus: 'COLLECTING', jobId: 'job-1', monthly: [], recentDeals: [] };
// 모으기 진행(서버가 COLLECTING 에만 준다) — 처음 모으는 중(실패 없음) · 받기 실패(UTC 11/24 17:00 = 한국 11/25 02:00 마지막 시도)
// 일부 모음(실패 없음 · 11/27 배포 노원구처럼 실패한 달도 있음)도 더함(#267)
const progress = (values) => ({
  requiredMonths: 13, collectedMonths: 0, failedMonths: 0, notTriedMonths: 13, lastAttemptedAt: null, lastFailedAt: null, lastErrorCode: null, ...values,
});
const collectingNotTried = { ...collecting, collectionProgress: progress() };
const collectingPartial = { ...collecting, collectionProgress: progress({ collectedMonths: 4, notTriedMonths: 9, lastAttemptedAt: '2026-11-24T17:00:03.000Z' }) };
const collectingPartialFailed = {
  ...collecting,
  collectionProgress: progress({
    collectedMonths: 8, failedMonths: 5, notTriedMonths: 0, lastAttemptedAt: '2026-11-26T17:32:00.000Z', lastFailedAt: '2026-11-24T17:32:00.000Z', lastErrorCode: '30',
  }),
};
const collectingFailed = { ...collecting, collectionProgress: progress({ failedMonths: 13, notTriedMonths: 0, lastAttemptedAt: '2026-11-24T17:00:05.000Z', lastErrorCode: 'NO_KEY' }) };
const empty = { ...ready({ dealType: 'SALE' }), monthly: [], recentDeals: [] };

const renderMarket = (path = '/community/market') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/landlord${path}`]}>
        <Routes>
          <Route path="/landlord/community/*" element={<CommunityPage onNavigate={vi.fn()} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
};
// 파일의 첫 렌더는 화면 코드를 처음 불러와 전체 실행 때 1초를 넘기기도 한다 — 첫 대기만 여유를 둔다
const FIRST_RENDER = { timeout: 3000 };
const sourceLine = (text) => screen.findByText((_, el) => el?.tagName === 'P' && el.textContent === text, {}, FIRST_RENDER);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.getMyBuildings.mockResolvedValue([BUILDING]);
  api.getCommunityProfile.mockResolvedValue({ nickname: '석촌호수뷰', nextChangeAt: null, previewLabel: '파크리오 201동 임대인' });
  api.getComplexMarketPrices.mockImplementation(async (params) => ready(params));
});

describe('시세 탭(국토교통부 실거래가)', () => {
  it('출처 줄 "출처: 국토교통부 실거래가 · 기준 {asOf}", 예시 배지 없음, 최근 거래 표와 매매 · 전세 두 번 부르기', async () => {
    renderMarket();
    expect(await sourceLine('출처: 국토교통부 실거래가 · 기준 2026-11-17')).toBeInTheDocument();
    expect(screen.queryByText(/예시 데이터/)).not.toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(3); // 머리 + 거래 2
    expect(rows[1]).toHaveTextContent('24억 7,000만');
    // 내 호실 면적대(84.79㎡ → 60–85㎡)로, 매매 화면은 전세 선도 함께
    expect(api.getComplexMarketPrices).toHaveBeenCalledWith({ complexId: 'complex-park', dealType: 'SALE', areaMin: 60, areaMax: 85 });
    expect(api.getComplexMarketPrices).toHaveBeenCalledWith({ complexId: 'complex-park', dealType: 'JEONSE', areaMin: 60, areaMax: 85 });
  });

  it('월세로 바꾸면 dealType MONTHLY 로 다시 부르고 표에 보증금 · 월세', async () => {
    renderMarket();
    await sourceLine('출처: 국토교통부 실거래가 · 기준 2026-11-17');
    await userEvent.click(within(screen.getByRole('radiogroup', { name: '거래 유형' })).getByRole('radio', { name: '월세' }));
    expect(await screen.findByText('보증금 / 월세')).toBeInTheDocument();
    expect(api.getComplexMarketPrices).toHaveBeenCalledWith({ complexId: 'complex-park', dealType: 'MONTHLY', areaMin: 60, areaMax: 85 });
    const row = within(screen.getByRole('table')).getAllByRole('row')[1];
    expect(row).toHaveTextContent('보증금 12억');
    expect(row).toHaveTextContent('월 280만');
  });

  it('면적대를 바꾸면 그 구간으로 다시 부른다(105㎡ 초과는 areaMax 없음)', async () => {
    renderMarket();
    await sourceLine('출처: 국토교통부 실거래가 · 기준 2026-11-17');
    await userEvent.click(within(screen.getByRole('radiogroup', { name: '면적대' })).getByRole('radio', { name: '105㎡ 초과' }));
    await screen.findAllByRole('row');
    expect(api.getComplexMarketPrices).toHaveBeenCalledWith({ complexId: 'complex-park', dealType: 'SALE', areaMin: 105, areaMax: undefined });
  });

  it('아직 모으는 단지(COLLECTING)는 모으는 중 안내 — 빈 상태 문구 · 출처 줄 · 표 없음', async () => {
    api.getComplexMarketPrices.mockResolvedValue(collecting);
    renderMarket();
    expect(await screen.findByText('이 단지의 실거래를 모으는 중이에요', {}, FIRST_RENDER)).toBeInTheDocument();
    expect(screen.getByText('하루 안에 채워집니다. 그때 다시 열어 주세요.')).toBeInTheDocument();
    expect(screen.queryByText(/거래가 없습니다/)).not.toBeInTheDocument();
    expect(screen.queryByText(/출처:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('모으는 중 · 아직 시도 전(모은 달 · 실패한 달 0)이면 "하루 안에" 문구 그대로 — 마지막 시도 날짜 없음', async () => {
    api.getComplexMarketPrices.mockResolvedValue(collectingNotTried);
    renderMarket();
    expect(await screen.findByText('이 단지의 실거래를 모으는 중이에요', {}, FIRST_RENDER)).toBeInTheDocument();
    expect(screen.getByText('하루 안에 채워집니다. 그때 다시 열어 주세요.')).toBeInTheDocument();
    expect(screen.queryByText('시세를 아직 불러오지 못했어요')).not.toBeInTheDocument();
    expect(screen.queryByText(/마지막 시도|개월을 모았어요/)).not.toBeInTheDocument();
  });

  it('모으는 중 · 실패 없이 일부만 모았으면 "시세를 모으는 중이에요" + 최근 13개월 중 n개월(숫자 글꼴) · 매일 새벽 이어서 — "하루 안에" 없음', async () => {
    api.getComplexMarketPrices.mockResolvedValue(collectingPartial);
    renderMarket();
    expect(await screen.findByText('시세를 모으는 중이에요', {}, FIRST_RENDER)).toBeInTheDocument();
    const description = screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '최근 13개월 중 4개월을 모았어요 · 매일 새벽 이어서 모아요');
    expect(within(description).getByText('13')).toHaveClass('font-num', 'tabular-nums');
    expect(within(description).getByText('4')).toHaveClass('font-num', 'tabular-nums');
    expect(screen.queryByText(/하루 안에|불러오지 못했어요|마지막 시도/)).not.toBeInTheDocument();
    expect(screen.queryByText('이 단지의 실거래를 모으는 중이에요')).not.toBeInTheDocument();
    // 일부만 모였을 때 숫자(평균 · 차트 · 표)는 그리지 않는다 — READY 가 될 때까지
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/출처:/)).not.toBeInTheDocument();
  });

  it('모으는 중 · 일부 모았으면 실패한 달이 있어도(노원구 8 · 5 · 0, 옛 코드 30) 실패 안내가 아니라 모은 개월 수', async () => {
    api.getComplexMarketPrices.mockResolvedValue(collectingPartialFailed);
    renderMarket();
    expect(await screen.findByText('시세를 모으는 중이에요', {}, FIRST_RENDER)).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '최근 13개월 중 8개월을 모았어요 · 매일 새벽 이어서 모아요')).toBeInTheDocument();
    expect(screen.queryByText(/불러오지 못했어요|마지막 시도|30/)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('모으는 중 · 받기가 실패한 달이 있으면 "아직 불러오지 못했어요" + 매일 새벽 다시 시도 · 마지막 시도 한국 날짜 — "하루 안에" · 실패 코드 없음', async () => {
    api.getComplexMarketPrices.mockResolvedValue(collectingFailed);
    renderMarket();
    expect(await screen.findByText('시세를 아직 불러오지 못했어요', {}, FIRST_RENDER)).toBeInTheDocument();
    const description = screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '매일 새벽 다시 시도하고 있어요 · 마지막 시도 2026-11-25');
    expect(within(description).getByText('2026-11-25')).toHaveClass('font-num', 'tabular-nums');
    expect(screen.queryByText(/하루 안에/)).not.toBeInTheDocument();
    expect(screen.queryByText('이 단지의 실거래를 모으는 중이에요')).not.toBeInTheDocument();
    expect(screen.queryByText(/NO_KEY/)).not.toBeInTheDocument();
    expect(screen.queryByText(/출처:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('모은 단지인데 그 면적대에 거래가 없으면 빈 상태(모으는 중과 다른 문구) + 출처 줄', async () => {
    api.getComplexMarketPrices.mockResolvedValue(empty);
    renderMarket();
    expect(await screen.findByText('60–85㎡에는 최근 매매 거래가 없습니다.', {}, FIRST_RENDER)).toBeInTheDocument();
    expect(screen.queryByText('이 단지의 실거래를 모으는 중이에요')).not.toBeInTheDocument();
    expect(await sourceLine('출처: 국토교통부 실거래가 · 기준 2026-11-17')).toBeInTheDocument();
  });
});

describe('차트 · 대표 숫자 — 빈 달은 점선, 이번 달은 빼고 지난달까지', () => {
  // 한국 시간 2026-11-17: 이번 달 2026-11 은 차트 · 큰 숫자 · 증감에서 빠지고 "최근 거래" 표에만
  const row = (yearMonth, dealCount, values) => ({ yearMonth, dealCount, avgPrice: null, minPrice: null, maxPrice: null, avgDeposit: null, avgMonthlyRent: null, ...values });
  const deal = (contractDate, values) => ({ contractDate, dealType: 'SALE', complexName: '파크리오', exclusiveArea: 84.79, floor: 9, price: null, deposit: null, monthlyRent: null, ...values });
  const sale = {
    ...ready({ dealType: 'SALE' }),
    asOf: '2026-11-16',
    // 6월 · 9월은 거래 없음, 11월(이번 달)은 반쪽
    monthly: [row('2026-05', 2, { avgPrice: 2000000000 }), row('2026-07', 1, { avgPrice: 2100000000 }), row('2026-08', 1, { avgPrice: 2200000000 }), row('2026-10', 2, { avgPrice: 2400000000 }), row('2026-11', 1, { avgPrice: 3000000000 })],
    recentDeals: [deal('2026-11-05', { price: 3000000000 }), deal('2026-10-28', { price: 2400000000 })],
  };
  const jeonse = {
    ...ready({ dealType: 'JEONSE' }),
    asOf: '2026-11-16',
    monthly: [row('2026-09', 2, { avgDeposit: 1100000000 }), row('2026-10', 2, { avgDeposit: 1200000000 }), row('2026-11', 5, { avgDeposit: 2000000000 })],
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T03:00:00Z'));
    api.getComplexMarketPrices.mockImplementation(async ({ dealType }) => (dealType === 'JEONSE' ? jeonse : sale));
  });
  afterEach(() => vi.useRealTimers());

  it('거래 있는 달에만 점, 이웃한 달은 실선, 빈 달을 건너면 점선 — 이번 달(11월)은 그리지 않는다', async () => {
    renderMarket();
    await sourceLine('출처: 국토교통부 실거래가 · 기준 2026-11-16');
    const chart = screen.getByRole('img', { name: /추이/ });
    const saleLine = chart.querySelector('[data-series="매매"]');
    expect([...saleLine.querySelectorAll('circle[data-month]')].map((dot) => dot.getAttribute('data-month'))).toEqual(['2026-05', '2026-07', '2026-08', '2026-10']);
    expect(saleLine.querySelectorAll('[data-segment="gap"]')).toHaveLength(2); // 5→7월, 8→10월
    expect(saleLine.querySelectorAll('[data-segment="gap"]')[0]).toHaveAttribute('stroke-dasharray', '4 4');
    expect(saleLine.querySelectorAll('[data-segment="solid"]')).toHaveLength(1); // 7–8월
    // 차트 달은 모은 첫 달(2025-12)부터 지난달(2026-10)까지
    expect(chart).toHaveAttribute('aria-label', '최근 12개월 매매·전세 추이');
    // 가로축: 마지막 달에서 거꾸로 3개월마다 · 세로축: 눈금 2~3개(억)
    expect([...chart.querySelectorAll('[data-tick="x"]')].map((text) => text.textContent)).toEqual(['26-01', '26-04', '26-07', '26-10']);
    const yTicks = [...chart.querySelectorAll('[data-tick="y"]')].map((text) => text.textContent);
    expect(yTicks.length).toBeGreaterThanOrEqual(2);
    expect(yTicks.length).toBeLessThanOrEqual(3);
    expect(yTicks.every((label) => /^\d+(\.\d+)?억$/.test(label))).toBe(true);
    expect(chart.querySelectorAll('circle[data-month="2026-11"]')).toHaveLength(0);
  });

  it('큰 숫자는 최근 3개월(8~10월) 평균(백만 원 반올림), 오른쪽 위는 지난달, 설명은 면적대 · 전세 평균, 증감은 ▲▼ 와 비교 대상, 출처 줄은 카드 바로 아래', async () => {
    renderMarket();
    await sourceLine('출처: 국토교통부 실거래가 · 기준 2026-11-16');
    expect(screen.getByText('매매 시세')).toBeInTheDocument();
    expect(screen.getByText('2026-10')).toBeInTheDocument();
    expect(screen.getByText('23억 3,300만')).toBeInTheDocument(); // (22억 + 24억 × 2) ÷ 3 = 23억 3,333만 → 백만 원 반올림 — 이번 달 30억은 넣지 않음
    expect(screen.getByText('최근 3개월 평균 · 60–85㎡ · 전세 11억 5,000만')).toBeInTheDocument();
    // 증감: 최근 3개월 평균 23억 3,333만 ÷ 직전 3개월(5~7월) 평균 (20억 × 2 + 21억) ÷ 3 = 20억 3,333만
    const change = screen.getByText('직전 3개월보다 ▲14.8%');
    expect(change).toHaveClass('text-ink-2');
    expect(change).not.toHaveClass('text-ok');
    // 출처 줄은 차트 카드 바로 아래(오른쪽 표 길이와 상관없이 스크롤 없이 보이게)
    const source = screen.getByText((_, el) => el?.tagName === 'P' && el.textContent.startsWith('출처:'));
    expect(source.previousElementSibling).toContainElement(screen.getByRole('img', { name: /추이/ }));
    // 이번 달 거래는 "최근 거래" 표에는 그대로
    expect(within(screen.getByRole('table')).getAllByRole('row')[1]).toHaveTextContent('2026-11-05');
  });
});

describe('일부만 모았을 때 — 모은 달의 시세를 보이고 틀릴 수 있는 숫자만 막는다 (#267 2차)', () => {
  const MONTHS = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
  const row = (yearMonth, dealCount, values) => ({ yearMonth, dealCount, avgPrice: null, minPrice: null, maxPrice: null, avgDeposit: null, avgMonthlyRent: null, ...values });
  const deal = (contractDate, price) => ({ contractDate, dealType: 'SALE', complexName: '파크리오', exclusiveArea: 84.79, floor: 9, price, deposit: null, monthlyRent: null });
  // 다 모았을 때의 위 "차트 · 대표 숫자" 와 같은 거래(5월 20억 × 2 · 7월 21억 · 8월 22억 · 10월 24억 × 2 · 11월 30억)
  const DEALS = { '2026-05': [2, 2000000000], '2026-07': [1, 2100000000], '2026-08': [1, 2200000000], '2026-10': [2, 2400000000], '2026-11': [1, 3000000000] };
  const RECENT = [deal('2026-11-05', 3000000000), deal('2026-10-28', 2400000000), deal('2026-05-20', 2000000000)];
  // 서버의 일부 모음 응답 모양: 요청 기간의 모든 달 + collected(못 모은 달은 null), 거래는 모은 달의 것만, asOf 는 모은 달 기준
  const partialSale = (missing, deals = DEALS) => ({
    ...ready({ dealType: 'SALE' }),
    coveredFromYearMonth: null,
    asOf: '2026-11-16',
    collectionStatus: 'COLLECTING',
    jobId: 'job-1',
    collectionProgress: progress({ collectedMonths: 13 - missing.length, failedMonths: missing.length, notTriedMonths: 0, lastErrorCode: '30' }),
    monthly: MONTHS.map((yearMonth) => {
      if (missing.includes(yearMonth)) return { ...row(yearMonth, null), collected: false };
      return deals[yearMonth] ? { ...row(yearMonth, deals[yearMonth][0], { avgPrice: deals[yearMonth][1] }), collected: true } : { ...row(yearMonth, 0), collected: true };
    }),
    recentDeals: RECENT.filter((item) => !missing.includes(item.contractDate.slice(0, 7)) && deals[item.contractDate.slice(0, 7)]),
  });
  const jeonse = {
    ...ready({ dealType: 'JEONSE' }),
    asOf: '2026-11-16',
    monthly: [row('2026-09', 2, { avgDeposit: 1100000000 }), row('2026-10', 2, { avgDeposit: 1200000000 })],
  };
  const answer = (sale) => api.getComplexMarketPrices.mockImplementation(async ({ dealType }) => (dealType === 'JEONSE' ? jeonse : sale));
  const basisLine = () => screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '최근 13개월 중 8개월 기준 · 나머지는 매일 새벽 채워요');

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T03:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('① 오래된 5개월이 빠짐(최근 6개월은 있음): 안내 대신 데이터 — 평균 · 증감은 다 모았을 때와 같고, 차트 앞쪽은 "수집 중", 출처 아래 "N개월 기준"', async () => {
    answer(partialSale(MONTHS.slice(0, 5)));
    renderMarket();
    await sourceLine('출처: 국토교통부 실거래가 · 기준 2026-11-16');
    expect(screen.queryByText(/시세를 모으는 중이에요|불러오지 못했어요|하루 안에/)).not.toBeInTheDocument();
    expect(screen.getByText('23억 3,300만')).toBeInTheDocument();
    expect(screen.getByText('최근 3개월 평균 · 60–85㎡ · 전세 11억 5,000만')).toBeInTheDocument();
    expect(screen.getByText('직전 3개월보다 ▲14.8%')).toBeInTheDocument();
    const chart = screen.getByRole('img', { name: /추이/ });
    expect(chart).toHaveAttribute('aria-label', '최근 12개월 매매·전세 추이 · 매매 수집 중 5개월');
    expect(chart.querySelector('[data-missing-band]')).toHaveAttribute('data-missing-band', '2025-11~2026-03');
    expect(screen.getByText('매매 수집 중', { selector: 'span' })).toBeInTheDocument(); // 범례
    // 출처 줄 바로 다음에 "N개월 기준"(숫자는 숫자 글꼴)
    const basis = basisLine();
    expect(basis.previousElementSibling).toHaveTextContent('출처: 국토교통부 실거래가 · 기준 2026-11-16');
    expect(within(basis).getByText('8')).toHaveClass('font-num', 'tabular-nums');
    // 최근 거래 표: 모은 달의 거래
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4); // 머리 + 3건
  });

  it('② 최근 달이 빠짐(7 ~ 11월): 큰 숫자 대신 "최근 3개월 평균은 모으는 중" · 증감 숨김 — 모은 다른 달로 대신 계산하지 않는다. 차트 뒤쪽은 "수집 중"', async () => {
    answer(partialSale(MONTHS.slice(8)));
    renderMarket();
    await sourceLine('출처: 국토교통부 실거래가 · 기준 2026-11-16');
    expect(screen.getByText('최근 3개월 평균은 모으는 중 · 60–85㎡')).toBeInTheDocument();
    // 큰 숫자 자리가 없다(5월 20억 같은 다른 달로 대신 채우지 않는다) · 증감 없음
    expect(document.querySelector('.text-kpi')).toBeNull();
    expect(screen.queryByText(/직전 3개월/)).not.toBeInTheDocument();
    const chart = screen.getByRole('img', { name: /추이/ });
    expect(chart.querySelector('[data-missing-band]')).toHaveAttribute('data-missing-band', '2026-07~2026-10');
    expect(chart.querySelector('[data-series="매매"]').querySelectorAll('circle[data-month]')).toHaveLength(1); // 5월만
    expect(basisLine()).toBeInTheDocument();
    // 최근 거래 표: 모은 달(5월)의 거래만
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('2026-05-20');
  });

  it('③ 모은 달에 그 면적대 거래가 없으면 "최근 … 거래가 없습니다" 가 아니라 본 범위를 밝힌 빈 상태 + "N개월 기준"', async () => {
    answer(partialSale(MONTHS.slice(0, 5), {}));
    renderMarket();
    expect(await screen.findByText('모은 8개월 동안 60–85㎡ 매매 거래가 없습니다.', {}, FIRST_RENDER)).toBeInTheDocument();
    expect(screen.queryByText(/최근 매매 거래가 없습니다/)).not.toBeInTheDocument();
    expect(basisLine()).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('하나도 못 모았으면(monthly 빈 배열) 지금(#268) 안내 그대로 — 데이터 · "N개월 기준" 없음', async () => {
    answer(collectingFailed);
    renderMarket();
    expect(await screen.findByText('시세를 아직 불러오지 못했어요', {}, FIRST_RENDER)).toBeInTheDocument();
    expect(screen.queryByText(/개월 기준/)).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /추이/ })).not.toBeInTheDocument();
  });

  it('① 의 띠 글자는 "매매 수집 중"(지금 고른 거래), 띠는 한 겹', async () => {
    answer(partialSale(MONTHS.slice(0, 5)));
    renderMarket();
    await sourceLine('출처: 국토교통부 실거래가 · 기준 2026-11-16');
    const chart = screen.getByRole('img', { name: /추이/ });
    expect(chart.querySelectorAll('[data-missing-band]')).toHaveLength(1);
    expect(chart.querySelector('[data-missing-label]')).toHaveTextContent('매매 수집 중');
  });

  it('비교 선(전세)만 못 모음: 띠 · 범례 · "N개월 기준" 없음, 전세 선만 그 달에서 끊기고(점선 없음) 전세 평균 덧붙임도 빠진다', async () => {
    const sale = {
      ...ready({ dealType: 'SALE' }),
      asOf: '2026-11-16',
      monthly: [row('2026-08', 1, { avgPrice: 2200000000 }), row('2026-09', 1, { avgPrice: 2300000000 }), row('2026-10', 2, { avgPrice: 2400000000 })],
    };
    // 전월세만 2026-09 를 못 모음(매매와 따로 모은다)
    const jeonsePartial = {
      ...ready({ dealType: 'JEONSE' }),
      coveredFromYearMonth: null,
      asOf: '2026-11-16',
      collectionStatus: 'COLLECTING',
      jobId: 'job-2',
      collectionProgress: progress({ collectedMonths: 12, failedMonths: 1, notTriedMonths: 0 }),
      monthly: MONTHS.map((yearMonth) => {
        if (yearMonth === '2026-09') return { ...row(yearMonth, null), collected: false };
        if (yearMonth === '2026-08' || yearMonth === '2026-10') return { ...row(yearMonth, 2, { avgDeposit: 1100000000 }), collected: true };
        return { ...row(yearMonth, 0), collected: true };
      }),
      recentDeals: [],
    };
    api.getComplexMarketPrices.mockImplementation(async ({ dealType }) => (dealType === 'JEONSE' ? jeonsePartial : sale));
    renderMarket();
    await sourceLine('출처: 국토교통부 실거래가 · 기준 2026-11-16');
    const chart = screen.getByRole('img', { name: /추이/ });
    expect(chart).toHaveAttribute('aria-label', '최근 12개월 매매·전세 추이');
    expect(chart.querySelector('[data-missing-band]')).toBeNull();
    expect(screen.queryByText(/수집 중|개월 기준/)).not.toBeInTheDocument();
    const jeonseLine = chart.querySelector('[data-series="전세"]');
    expect([...jeonseLine.querySelectorAll('circle[data-month]')].map((dot) => dot.getAttribute('data-month'))).toEqual(['2026-08', '2026-10']);
    expect(jeonseLine.querySelectorAll('[data-segment="gap"]')).toHaveLength(0); // 08 → 10 을 점선으로 잇지 않는다
    // 매매는 다 모아 큰 숫자 그대로, 전세 평균 덧붙임은 전세 최근 3개월이 다 모이지 않아 빠진다
    expect(screen.getByText('최근 3개월 평균 · 60–85㎡')).toBeInTheDocument();
  });

  it('다 모았으면(READY) "N개월 기준" · "수집 중" 없음 — 지금 화면 그대로', async () => {
    answer({ ...ready({ dealType: 'SALE' }), asOf: '2026-11-16' });
    renderMarket();
    await sourceLine('출처: 국토교통부 실거래가 · 기준 2026-11-16');
    expect(screen.queryByText(/개월 기준|수집 중/)).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /추이/ }).querySelector('[data-missing-band]')).toBeNull();
  });
});

// #274 — 칩 = 그 단지 실거래 구간(my-buildings dealAreas) + 내 호실 구간, 정보 없으면 4개, 하나면 글자. 면적은 로컬 실제 단지의 전용면적
describe('면적대 칩 — 그 단지가 가진 면적대만 (#274)', () => {
  const PARKRIO = [35.24, 59.98, 84.79, 144.77]; // 85–105 거래 없음
  const JUNGGYE = [39.6, 49.85, 59.39]; // 60㎡ 이하만
  const openWith = (building) => {
    api.getMyBuildings.mockResolvedValue([{ ...BUILDING, ...building }]);
    return renderMarket();
  };
  const areaGroup = () => screen.findByRole('radiogroup', { name: '면적대' }, FIRST_RENDER);
  const chipTexts = (group) => within(group).getAllByRole('radio').map((radio) => radio.textContent);
  const checkedText = (group) => within(group).getByRole('radio', { checked: true }).textContent;
  const lastSaleCall = () => api.getComplexMarketPrices.mock.calls.filter(([params]) => params.dealType === 'SALE').at(-1)[0];

  it('칩 3개(파크리오 모양) — 거래가 없는 85–105 는 빠지고, 내 호실 구간(점)이 기본', async () => {
    openWith({ unitAreas: [84.79], dealAreas: PARKRIO });
    const group = await areaGroup();
    expect(chipTexts(group)).toEqual(['60㎡ 이하', '60–85㎡', '105㎡ 초과']);
    expect(checkedText(group)).toBe('60–85㎡');
    expect(within(group).getByRole('radio', { checked: true }).querySelector('[aria-label="내 호실"]')).not.toBeNull();
    expect(screen.getByText('내 호실이 있는 면적대입니다')).toBeInTheDocument();
  });

  it('하나만 남음(중계그린 모양) — 칩 대신 글자 "전용 60㎡ 이하", 그 구간으로 부르고 내 호실 안내는 없다', async () => {
    openWith({ name: '중계그린아파트', unitAreas: [], dealAreas: JUNGGYE });
    expect(await screen.findByText('전용 60㎡ 이하', {}, FIRST_RENDER)).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: '면적대' })).not.toBeInTheDocument();
    expect(screen.queryByText('내 호실이 있는 면적대입니다')).not.toBeInTheDocument();
    await sourceLine('출처: 국토교통부 실거래가 · 기준 2026-11-17');
    expect(lastSaleCall()).toEqual({ complexId: 'complex-park', dealType: 'SALE', areaMin: undefined, areaMax: 60 });
  });

  it('하나만 남았는데 내 호실 구간이면 글자 + "내 호실이 있는 면적대입니다" 그대로', async () => {
    openWith({ name: '중계그린아파트', unitAreas: [49.85], dealAreas: JUNGGYE });
    expect(await screen.findByText('전용 60㎡ 이하', {}, FIRST_RENDER)).toBeInTheDocument();
    expect(screen.getByText('내 호실이 있는 면적대입니다')).toBeInTheDocument();
  });

  it('거래 정보 없음(수집 전 · 연결 전 · 0건 — 빈 목록) — 지금처럼 4개, 60–85 로 시작', async () => {
    openWith({ unitAreas: [], dealAreas: [] });
    const group = await areaGroup();
    expect(chipTexts(group)).toEqual(['60㎡ 이하', '60–85㎡', '85–105㎡', '105㎡ 초과']);
    expect(checkedText(group)).toBe('60–85㎡');
  });

  it('내 호실 구간에 거래가 없어도 그 칩은 보이고(점) 기본으로 고른다', async () => {
    openWith({ unitAreas: [101.2], dealAreas: PARKRIO });
    const group = await areaGroup();
    expect(chipTexts(group)).toEqual(['60㎡ 이하', '60–85㎡', '85–105㎡', '105㎡ 초과']);
    expect(checkedText(group)).toBe('85–105㎡');
    expect(within(group).getByRole('radio', { checked: true }).querySelector('[aria-label="내 호실"]')).not.toBeNull();
    await sourceLine('출처: 국토교통부 실거래가 · 기준 2026-11-17');
    expect(lastSaleCall()).toEqual({ complexId: 'complex-park', dealType: 'SALE', areaMin: 85, areaMax: 105 });
  });

  it.each([
    ['① 내 호실 구간', { unitAreas: [144.77], dealAreas: PARKRIO }, '105㎡ 초과', { areaMin: 105, areaMax: undefined }],
    ['② 내 호실이 없으면 60–85 가 보일 때 60–85', { unitAreas: [], dealAreas: PARKRIO }, '60–85㎡', { areaMin: 60, areaMax: 85 }],
    ['③ 60–85 도 없으면 보이는 칩 중 첫째', { unitAreas: [], dealAreas: [59.9, 120.36] }, '60㎡ 이하', { areaMin: undefined, areaMax: 60 }],
  ])('기본 선택 %s', async (_name, building, checked, area) => {
    openWith(building);
    expect(checkedText(await areaGroup())).toBe(checked);
    await sourceLine('출처: 국토교통부 실거래가 · 기준 2026-11-17');
    expect(lastSaleCall()).toEqual({ complexId: 'complex-park', dealType: 'SALE', ...area });
  });

  it('거래 유형을 바꿔도 칩은 그대로(매매 · 전세 · 월세 합쳐 센 구간)', async () => {
    openWith({ unitAreas: [84.79], dealAreas: PARKRIO });
    await sourceLine('출처: 국토교통부 실거래가 · 기준 2026-11-17');
    await userEvent.click(within(screen.getByRole('radiogroup', { name: '거래 유형' })).getByRole('radio', { name: '월세' }));
    expect(await screen.findByText('보증금 / 월세')).toBeInTheDocument();
    expect(chipTexts(screen.getByRole('radiogroup', { name: '면적대' }))).toEqual(['60㎡ 이하', '60–85㎡', '105㎡ 초과']);
  });

  it('고른 칩이 사라지면(건물 목록을 다시 받아 그 구간 거래가 빠짐) 기본 선택으로', async () => {
    const client = openWith({ unitAreas: [], dealAreas: PARKRIO });
    const group = await areaGroup();
    await userEvent.click(within(group).getByRole('radio', { name: '105㎡ 초과' }));
    expect(checkedText(screen.getByRole('radiogroup', { name: '면적대' }))).toBe('105㎡ 초과');
    act(() => {
      client.setQueryData(['community_my_buildings'], [{ ...BUILDING, unitAreas: [], dealAreas: [59.98, 84.79] }]);
    });
    // react-query 는 알림을 다음 차례(setTimeout 0)에 보낸다 — 다시 그려질 때까지 기다린다
    await waitFor(() => expect(chipTexts(screen.getByRole('radiogroup', { name: '면적대' }))).toEqual(['60㎡ 이하', '60–85㎡']));
    expect(checkedText(screen.getByRole('radiogroup', { name: '면적대' }))).toBe('60–85㎡');
    expect(lastSaleCall()).toEqual({ complexId: 'complex-park', dealType: 'SALE', areaMin: 60, areaMax: 85 });
  });
});
