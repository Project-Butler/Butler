import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityPage } from '../../src/landlord/web/pages/CommunityPage';

const api = vi.hoisted(() => ({
  getMyBuildings: vi.fn(),
  getCommunityPost: vi.fn(),
  getCommunityPoll: vi.fn(),
  getCommunityPostList: vi.fn(),
  getCommunityPollList: vi.fn(),
  getCommunityNewsList: vi.fn(),
  postCommunityPost: vi.fn(),
  patchCommunityPost: vi.fn(),
  deleteCommunityPost: vi.fn(),
  postCommunityComment: vi.fn(),
  deleteCommunityComment: vi.fn(),
  postCommunityReport: vi.fn(),
  postCommunityPoll: vi.fn(),
  postCommunityVote: vi.fn(),
  deleteCommunityPoll: vi.fn(),
  getComplexMarketPrices: vi.fn(),
}));

vi.mock('@butler/api-client', () => ({
  ...api,
  queryKey: {
    COMMUNITY_MY_BUILDINGS: 'community_my_buildings',
    COMMUNITY_POSTS: 'community_posts',
    COMMUNITY_POST_DETAIL: 'community_post',
    COMMUNITY_POLLS: 'community_polls',
    COMMUNITY_POLL_DETAIL: 'community_poll',
    COMMUNITY_NEWS: 'community_news',
    MARKET_PRICES: 'market_prices',
  },
}));

const REGION = { legalDongCode: '1171010100', dongName: '잠실동', fullName: '서울특별시 송파구 잠실동', sigunguName: '송파구' };
const BUILDING = {
  complexId: '0c000000-0000-4000-8000-000000000001',
  name: '잠실한빛아파트',
  legalDongCode: REGION.legalDongCode,
  regionName: REGION.fullName,
  unitCount: 2,
  unitAreas: [84.97, 59.84],
  memberCount: 3,
  verificationStatus: 'UNVERIFIED',
  verifyPropertyId: 'property-9',
};
const page = (items, meta = {}) => ({
  data: items,
  meta: { page: 1, size: 5, total: items.length, hasNext: false, region: REGION, canWrite: false, writeBlockedReason: 'UNVERIFIED', ...meta },
});
const post = (i) => ({ id: `post-${i}`, category: 'FREE', title: `게시글 ${i}`, authorLabel: '잠실한빛아파트 103동 임대인', commentCount: i, isMine: false, createdAt: '2026-10-22T01:00:00.000Z' });
const news = (i, scope) => ({ id: `${scope}-${i}`, scope, title: `${scope} 기사 ${i}`, url: `https://news.example/${scope}/${i}`, publisher: '한빛일보', publishedAt: '2026-10-24T01:00:00.000Z' });
const poll = (i, isClosed) => ({ id: `poll-${i}`, scope: 'REGION', complexId: null, title: `투표 ${i}`, closesAt: '2099-01-01T00:00:00.000Z', isClosed, voteCount: i, hasVoted: false });

// 시세 API 응답(연동 규격 2장 시세 모양, 금액은 원). 거래 있는 달만 monthly 에 온다
const marketReady = (dealType) => ({
  scope: 'COMPLEX', complexId: BUILDING.complexId, legalDongCode: REGION.legalDongCode, dealType, areaMin: 60, areaMax: 85,
  coveredFromYearMonth: '2025-11', asOf: '2026-11-17', source: '국토교통부 실거래가', collectionStatus: 'READY', jobId: null,
  monthly: [
    { yearMonth: '2026-08', dealCount: 4, avgPrice: 2310000000, minPrice: 2250000000, maxPrice: 2380000000, avgDeposit: null, avgMonthlyRent: null },
    { yearMonth: '2026-10', dealCount: 6, avgPrice: 2405000000, minPrice: 2330000000, maxPrice: 2470000000, avgDeposit: null, avgMonthlyRent: null },
  ],
  recentDeals: [
    { contractDate: '2026-10-28', dealType, complexName: '잠실한빛아파트', exclusiveArea: 84.79, floor: 15, price: 2470000000, deposit: null, monthlyRent: null },
    { contractDate: '2026-10-12', dealType, complexName: '잠실한빛아파트', exclusiveArea: 84.9, floor: 7, price: 2330000000, deposit: null, monthlyRent: null },
  ],
});
const marketCollecting = { ...marketReady('SALE'), coveredFromYearMonth: null, asOf: null, collectionStatus: 'COLLECTING', jobId: 'job-1', monthly: [], recentDeals: [] };
// 모으기 진행(COLLECTING 에만 온다). 받기 실패 — 마지막 시도 UTC 11/24 17:00 = 한국 11/25 02:00
// 세 상태(#267): 아직 시도 전 · 일부 모음(실패 없음 / 실패한 달도 있음) · 하나도 못 모음 + 실패
const collectionProgress = (values) => ({
  requiredMonths: 13, collectedMonths: 0, failedMonths: 0, notTriedMonths: 13, lastAttemptedAt: null, lastFailedAt: null, lastErrorCode: null, ...values,
});
const marketCollectingNotTried = { ...marketCollecting, collectionProgress: collectionProgress() };
const marketCollectingPartial = { ...marketCollecting, collectionProgress: collectionProgress({ collectedMonths: 2, notTriedMonths: 11, lastAttemptedAt: '2026-11-24T17:00:01.000Z' }) };
const marketCollectingPartialFailed = {
  ...marketCollecting,
  collectionProgress: collectionProgress({
    collectedMonths: 12, failedMonths: 1, notTriedMonths: 0, lastAttemptedAt: '2026-11-24T17:00:05.000Z', lastFailedAt: '2026-11-24T17:00:05.000Z', lastErrorCode: '30',
  }),
};
const marketCollectFailed = {
  ...marketCollecting,
  collectionProgress: collectionProgress({
    failedMonths: 13, notTriedMonths: 0, lastAttemptedAt: '2026-11-24T17:00:05.000Z', lastFailedAt: '2026-11-24T17:00:05.000Z', lastErrorCode: '30',
  }),
};

const LocationProbe = () => <output data-testid="location">{useLocation().pathname}</output>;

const renderAt = (path) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/landlord${path}`]}>
        <Routes>
          <Route path="/landlord/community/*" element={<CommunityPage onNavigate={vi.fn()} />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.getMyBuildings.mockResolvedValue([BUILDING]);
  api.getCommunityPostList.mockResolvedValue(page([1, 2, 3, 4, 5].map(post)));
  api.getCommunityNewsList.mockImplementation(async ({ scope }) =>
    scope === 'SIDO' ? page([1, 2, 3].map((i) => news(i, 'SIDO'))) : page([1, 2].map((i) => news(i, 'SIGUNGU')), { sidoFallback: true }),
  );
  api.getCommunityPollList.mockImplementation(async ({ status }) => (status === 'OPEN' ? page([poll(1, false)]) : page([poll(2, true), poll(3, true)])));
  api.getComplexMarketPrices.mockImplementation(async ({ dealType }) => marketReady(dealType));
});

const section = (name) => screen.findByRole('region', { name });

describe('브리핑', () => {
  it('/community 는 브리핑으로 가고, 탭 순서는 브리핑 · 뉴스 · 시세 · 게시판 · 투표', async () => {
    renderAt('/community');
    await section('시세');
    expect(screen.getByTestId('location')).toHaveTextContent('/landlord/community/briefing');
    const tabs = within(screen.getByRole('navigation', { name: '커뮤니티 메뉴' })).getAllByRole('button');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['브리핑', '뉴스', '시세', '게시판', '투표']);
    expect(tabs[0]).toHaveAttribute('aria-current', 'page');
  });

  it('다섯 섹션이 각자 내용을 보인다(게시글 5 · 뉴스는 시·군·구가 모자라 시·도로 채워 5 · 투표는 진행 중 먼저 3)', async () => {
    renderAt('/community/briefing');
    for (const name of ['시세', '최근 거래', '최근 게시글', '최근 뉴스', '최근 투표']) expect(await section(name)).toBeInTheDocument();

    const posts = await section('최근 게시글');
    expect(await within(posts).findAllByRole('button', { name: /게시글 \d/ })).toHaveLength(5);
    const newsCard = await section('최근 뉴스');
    const links = await within(newsCard).findAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining('SIGUNGU 기사 1'),
      expect.stringContaining('SIGUNGU 기사 2'),
      expect.stringContaining('SIDO 기사 1'),
      expect.stringContaining('SIDO 기사 2'),
      expect.stringContaining('SIDO 기사 3'),
    ]);
    const polls = await section('최근 투표');
    const cards = await within(polls).findAllByRole('button', { name: /투표 \d/ });
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual(['투표 1', '투표 2', '투표 3']);
    // 시세: 예시 배지 대신 출처 줄, 매매 · 내 호실 면적대로 시세 API 를 부른다
    const market = await section('시세');
    expect(await within(market).findByText((_, el) => el?.tagName === 'P' && el.textContent === '출처: 국토교통부 실거래가 · 기준 2026-11-17')).toBeInTheDocument();
    expect(within(market).queryByText(/예시 데이터/)).not.toBeInTheDocument();
    expect(api.getComplexMarketPrices).toHaveBeenCalledWith(expect.objectContaining({ complexId: BUILDING.complexId, dealType: 'SALE' }));
    expect(await within(await section('최근 거래')).findAllByRole('listitem')).toHaveLength(2);

    // 브리핑은 적게 부른다(size)
    expect(api.getCommunityPostList).toHaveBeenCalledWith(expect.objectContaining({ size: 5 }));
    expect(api.getCommunityPollList).toHaveBeenCalledWith(expect.objectContaining({ status: 'OPEN', size: 3 }));
  });

  it('더보기 › 는 해당 탭으로', async () => {
    renderAt('/community/briefing');
    const cases = [
      ['최근 게시글', '/landlord/community/board'],
      ['최근 뉴스', '/landlord/community/news'],
      ['최근 투표', '/landlord/community/polls'],
      ['시세', '/landlord/community/market'],
    ];
    for (const [name, path] of cases) {
      await userEvent.click(await within(await section(name)).findByRole('button', { name: `${name} 더보기` }));
      expect(screen.getByTestId('location')).toHaveTextContent(path);
      await userEvent.click(within(screen.getByRole('navigation', { name: '커뮤니티 메뉴' })).getByRole('button', { name: '브리핑' }));
    }
  });

  it('게시글 줄을 누르면 글 상세로(인증 전이면 상세가 잠금 화면)', async () => {
    api.getCommunityPost.mockResolvedValue({ ...post(1), legalDongCode: REGION.legalDongCode, canWrite: false, writeBlockedReason: 'UNVERIFIED', locked: true });
    renderAt('/community/briefing');
    await userEvent.click(await within(await section('최근 게시글')).findByRole('button', { name: /게시글 1/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/landlord/community/posts/post-1');
    expect(await screen.findByText('인증한 임대인만 볼 수 있어요')).toBeInTheDocument();
  });

  it('섹션 하나가 실패해도 나머지는 보인다', async () => {
    api.getCommunityPostList.mockRejectedValue(new Error('boom'));
    renderAt('/community/briefing');
    const posts = await section('최근 게시글');
    expect(await within(posts).findByRole('alert')).toHaveTextContent('불러오지 못했어요');
    expect(await within(await section('최근 뉴스')).findAllByRole('link')).toHaveLength(5);
    expect(await within(await section('최근 투표')).findAllByRole('button', { name: /투표 \d/ })).toHaveLength(3);
  });

  it('시세를 아직 모으는 단지면 시세 · 거래 섹션에 같은 안내 한 줄 — 거래 섹션도 "최근 거래가 없습니다" 가 아니다(나머지 섹션은 그대로)', async () => {
    api.getComplexMarketPrices.mockResolvedValue(marketCollecting);
    renderAt('/community/briefing');
    const market = await section('시세');
    expect(await within(market).findByText('실거래를 모으는 중이에요. 하루 안에 채워집니다')).toBeInTheDocument();
    expect(within(market).queryByText(/출처:/)).not.toBeInTheDocument();
    const deals = await section('최근 거래');
    expect(await within(deals).findByText('실거래를 모으는 중이에요. 하루 안에 채워집니다')).toHaveAttribute('role', 'status');
    expect(within(deals).queryByText('최근 거래가 없습니다')).not.toBeInTheDocument();
    expect(await within(await section('최근 게시글')).findAllByRole('button', { name: /게시글 \d/ })).toHaveLength(5);
  });

  // #267: 서버는 COLLECTING 이면 recentDeals 를 비워 준다 — 거래가 없는 게 아니라 아직 안 보여 주는 것
  it.each([
    ['일부 모음', marketCollectingPartial, '시세를 모으는 중이에요', '최근 13개월 중 2개월을 모았어요 · 매일 새벽 이어서 모아요'],
    ['일부 모음 + 실패', marketCollectingPartialFailed, '시세를 모으는 중이에요', '최근 13개월 중 12개월을 모았어요 · 매일 새벽 이어서 모아요'],
    ['하나도 못 모음 + 실패', marketCollectFailed, '시세를 아직 불러오지 못했어요', '매일 새벽 다시 시도하고 있어요 · 마지막 시도 2026-11-25'],
    ['아직 시도 전', marketCollectingNotTried, '실거래를 모으는 중이에요. 하루 안에 채워집니다', ''],
  ])('최근 거래 섹션 · 모으는 중(%s)이면 시세 섹션과 같은 안내 — "최근 거래가 없습니다" 없음', async (_, prices, title, description) => {
    api.getComplexMarketPrices.mockResolvedValue(prices);
    renderAt('/community/briefing');
    const deals = await section('최근 거래');
    const note = (await within(deals).findByText(title)).closest('p');
    expect(note).toHaveTextContent(`${title}${description}`);
    expect(within(deals).queryByText('최근 거래가 없습니다')).not.toBeInTheDocument();
    // 시세 섹션과 같은 글
    expect((await within(await section('시세')).findByText(title)).closest('p').textContent).toBe(note.textContent);
  });

  it('최근 거래 섹션 · 다 모았는데(READY) 그 면적대 거래가 0건이면 "최근 거래가 없습니다"', async () => {
    api.getComplexMarketPrices.mockResolvedValue({ ...marketReady('SALE'), monthly: [], recentDeals: [] });
    renderAt('/community/briefing');
    const deals = await section('최근 거래');
    expect(await within(deals).findByText('최근 거래가 없습니다')).toHaveAttribute('role', 'status');
    expect(within(deals).queryByText(/모으는 중|불러오지 못했어요/)).not.toBeInTheDocument();
  });

  it('모으는 중 · 아직 시도 전(모은 달 · 실패한 달 0)이면 "하루 안에" 한 줄 그대로', async () => {
    api.getComplexMarketPrices.mockResolvedValue(marketCollectingNotTried);
    renderAt('/community/briefing');
    const market = await section('시세');
    expect(await within(market).findByText('실거래를 모으는 중이에요. 하루 안에 채워집니다')).toBeInTheDocument();
    expect(within(market).queryByText(/불러오지 못했어요|개월을 모았어요/)).not.toBeInTheDocument();
  });

  it('모으는 중 · 실패 없이 일부만 모았으면 "시세를 모으는 중이에요" + 최근 13개월 중 n개월 · 매일 새벽 이어서(두 줄)', async () => {
    api.getComplexMarketPrices.mockResolvedValue(marketCollectingPartial);
    renderAt('/community/briefing');
    const market = await section('시세');
    const note = (await within(market).findByText('시세를 모으는 중이에요')).closest('p');
    expect(note).toHaveAttribute('role', 'status');
    expect(note).toHaveTextContent('시세를 모으는 중이에요최근 13개월 중 2개월을 모았어요 · 매일 새벽 이어서 모아요');
    expect(within(note).getByText('시세를 모으는 중이에요')).toHaveClass('block');
    expect(within(note).getByText('2')).toHaveClass('font-num', 'tabular-nums');
    // 덩어리마다 inline-block — 좁은 칸(최근 거래)에서도 "이어 / 서" 처럼 낱말 안에서 끊기지 않고 덩어리 사이에서만 줄이 바뀐다
    expect(within(note).getByText('매일 새벽 이어서 모아요')).toHaveClass('inline-block', 'break-keep');
    expect(within(market).queryByText(/하루 안에|불러오지 못했어요|마지막 시도|출처:/)).not.toBeInTheDocument();
  });

  it('모으는 중 · 일부 모았으면 실패한 달이 있어도 실패 안내가 아니라 모은 개월 수(실패 코드 · 날짜 없음)', async () => {
    api.getComplexMarketPrices.mockResolvedValue(marketCollectingPartialFailed);
    renderAt('/community/briefing');
    const market = await section('시세');
    const note = (await within(market).findByText('시세를 모으는 중이에요')).closest('p');
    expect(note).toHaveTextContent('시세를 모으는 중이에요최근 13개월 중 12개월을 모았어요 · 매일 새벽 이어서 모아요');
    expect(within(market).queryByText(/불러오지 못했어요|마지막 시도|30/)).not.toBeInTheDocument();
  });

  it('모으는 중 · 하나도 못 모았는데 받기가 실패한 달이 있으면 "아직 불러오지 못했어요" + 매일 새벽 다시 시도 · 마지막 시도 한국 날짜(두 줄)', async () => {
    api.getComplexMarketPrices.mockResolvedValue(marketCollectFailed);
    renderAt('/community/briefing');
    const market = await section('시세');
    const note = (await within(market).findByText('시세를 아직 불러오지 못했어요')).closest('p');
    expect(note).toHaveAttribute('role', 'status');
    expect(note).toHaveTextContent('시세를 아직 불러오지 못했어요매일 새벽 다시 시도하고 있어요 · 마지막 시도 2026-11-25');
    expect(within(note).getByText('시세를 아직 불러오지 못했어요')).toHaveClass('block');
    expect(within(note).getByText('2026-11-25')).toHaveClass('font-num', 'tabular-nums');
    expect(within(market).queryByText(/하루 안에/)).not.toBeInTheDocument();
    expect(within(market).queryByText(/30|출처:/)).not.toBeInTheDocument();
  });

  it('비었을 때는 섹션 안 한 줄', async () => {
    api.getCommunityPostList.mockResolvedValue(page([]));
    api.getCommunityPollList.mockResolvedValue(page([]));
    renderAt('/community/briefing');
    expect(await within(await section('최근 게시글')).findByText('아직 올라온 글이 없습니다')).toBeInTheDocument();
    expect(await within(await section('최근 투표')).findByText('아직 올라온 투표가 없습니다')).toBeInTheDocument();
  });
});

describe('브리핑 시세 — 시세 탭과 같은 규칙(지난달까지 최근 3개월 평균 · 빈 달 점선)', () => {
  const row = (yearMonth, dealCount, avgPrice) => ({ yearMonth, dealCount, avgPrice, minPrice: avgPrice, maxPrice: avgPrice, avgDeposit: null, avgMonthlyRent: null });
  beforeEach(() => {
    // 한국 시간 2026-11-17 — 이번 달(11월)은 빼고 8~10월로
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T03:00:00Z'));
    api.getComplexMarketPrices.mockResolvedValue({
      ...marketReady('SALE'),
      monthly: [row('2026-05', 2, 2000000000), row('2026-07', 1, 2100000000), row('2026-08', 1, 2200000000), row('2026-10', 2, 2400000000), row('2026-11', 1, 3000000000)],
    });
  });
  afterEach(() => vi.useRealTimers());

  it('큰 숫자 · 설명 한 줄(최근 3개월 평균 · 면적대 · 매매), 차트는 빈 달을 점선으로', async () => {
    renderAt('/community/briefing');
    const market = await section('시세');
    expect(await within(market).findByText('23억 3,300만')).toBeInTheDocument();
    expect(within(market).getByText('최근 3개월 평균 · 60–85㎡')).toBeInTheDocument();
    expect(within(market).getByText('직전 3개월보다 ▲14.8%')).toHaveClass('text-ink-2');
    const chart = within(market).getByRole('img');
    expect(chart).toHaveAttribute('aria-label', '최근 12개월 매매 추이');
    expect(chart.querySelectorAll('[data-segment="gap"]')).toHaveLength(2);
    expect(chart.querySelectorAll('circle[data-month="2026-11"]')).toHaveLength(0);
  });
});

describe('브리핑 — 일부만 모았을 때 시세 · 최근 거래 카드에 모은 달의 데이터 (#267 2차)', () => {
  const MONTHS = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
  const row = (yearMonth, dealCount, avgPrice = null) => ({ yearMonth, dealCount, avgPrice, minPrice: avgPrice, maxPrice: avgPrice, avgDeposit: null, avgMonthlyRent: null });
  const deal = (contractDate, price) => ({ contractDate, dealType: 'SALE', complexName: '잠실한빛아파트', exclusiveArea: 84.79, floor: 9, price, deposit: null, monthlyRent: null });
  const DEALS = { '2026-05': [2, 2000000000], '2026-07': [1, 2100000000], '2026-08': [1, 2200000000], '2026-10': [2, 2400000000], '2026-11': [1, 3000000000] };
  const RECENT = [deal('2026-11-05', 3000000000), deal('2026-10-28', 2400000000), deal('2026-05-20', 2000000000)];
  const partialSale = (missing, deals = DEALS) => ({
    ...marketReady('SALE'),
    coveredFromYearMonth: null,
    asOf: '2026-11-16',
    collectionStatus: 'COLLECTING',
    jobId: 'job-1',
    collectionProgress: collectionProgress({ collectedMonths: 13 - missing.length, failedMonths: missing.length, notTriedMonths: 0, lastErrorCode: '30' }),
    monthly: MONTHS.map((yearMonth) => {
      if (missing.includes(yearMonth)) return { ...row(yearMonth, null), collected: false };
      return deals[yearMonth] ? { ...row(yearMonth, ...deals[yearMonth]), collected: true } : { ...row(yearMonth, 0), collected: true };
    }),
    recentDeals: RECENT.filter((item) => !missing.includes(item.contractDate.slice(0, 7)) && deals[item.contractDate.slice(0, 7)]),
  });
  const BASIS = '최근 13개월 중 8개월 기준 · 나머지는 매일 새벽 채워요';
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T03:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('① 오래된 5개월이 빠짐: 시세 카드는 평균 · 증감 · 차트("수집 중") · 출처 · "N개월 기준", 최근 거래 카드는 거래 + "N개월 기준"', async () => {
    api.getComplexMarketPrices.mockResolvedValue(partialSale(MONTHS.slice(0, 5)));
    renderAt('/community/briefing');
    const market = await section('시세');
    expect(await within(market).findByText('23억 3,300만')).toBeInTheDocument();
    expect(within(market).getByText('직전 3개월보다 ▲14.8%')).toBeInTheDocument();
    expect(within(market).getByRole('img')).toHaveAttribute('aria-label', '최근 12개월 매매 추이 · 수집 중 5개월');
    expect(within(market).getByText('수집 중', { selector: 'span' })).toBeInTheDocument();
    expect(within(market).getByText((_, el) => el?.tagName === 'P' && el.textContent === BASIS)).toBeInTheDocument();
    expect(within(market).queryByText(/시세를 모으는 중이에요|불러오지 못했어요/)).not.toBeInTheDocument();
    const deals = await section('최근 거래');
    expect(within(deals).getAllByRole('listitem')).toHaveLength(3);
    expect(within(deals).getByText((_, el) => el?.tagName === 'P' && el.textContent === BASIS)).toBeInTheDocument();
    expect(within(deals).queryByText(/거래가 없습니다|모으는 중/)).not.toBeInTheDocument();
  });

  it('② 최근 달이 빠짐(7 ~ 11월): 시세 카드는 "최근 3개월 평균은 모으는 중"(큰 숫자 · 증감 없음), 최근 거래 카드는 모은 달(5월)의 거래', async () => {
    api.getComplexMarketPrices.mockResolvedValue(partialSale(MONTHS.slice(8)));
    renderAt('/community/briefing');
    const market = await section('시세');
    expect(await within(market).findByText('최근 3개월 평균은 모으는 중 · 60–85㎡')).toBeInTheDocument();
    expect(market.querySelector('.text-kpi')).toBeNull();
    expect(within(market).queryByText(/직전 3개월/)).not.toBeInTheDocument();
    expect(within(market).getByRole('img').querySelector('[data-missing-band]')).toHaveAttribute('data-missing-band', '2026-07~2026-10');
    const deals = await section('최근 거래');
    const items = within(deals).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('05-20');
  });

  it('③ 모은 달에 거래가 없으면 범위를 밝힌다 — 최근 거래 "모은 8개월 동안 거래가 없습니다", 시세 "모은 8개월 동안 60–85㎡ 매매 거래가 없습니다"', async () => {
    api.getComplexMarketPrices.mockResolvedValue(partialSale(MONTHS.slice(0, 5), {}));
    renderAt('/community/briefing');
    const deals = await section('최근 거래');
    expect(await within(deals).findByText('모은 8개월 동안 거래가 없습니다')).toHaveAttribute('role', 'status');
    expect(within(deals).queryByText('최근 거래가 없습니다')).not.toBeInTheDocument();
    expect(await within(await section('시세')).findByText('모은 8개월 동안 60–85㎡ 매매 거래가 없습니다')).toBeInTheDocument();
  });
});

