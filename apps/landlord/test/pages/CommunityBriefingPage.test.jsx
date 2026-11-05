import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityPage } from '../../src/pages/CommunityPage';

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
    COMMUNITY_MARKET_PRICES: 'community_market_prices',
  },
}));

const REGION = { legalDongCode: '1171010100', dongName: '잠실동', fullName: '서울특별시 송파구 잠실동', sigunguName: '송파구' };
// 시세는 화면 쪽 예시 데이터(utils/communityMarketPriceStub) — 데모 단지 id 라야 숫자가 나온다
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

const LocationProbe = () => <output data-testid="location">{useLocation().pathname}</output>;

const renderAt = (path) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/community/*" element={<CommunityPage onNavigate={vi.fn()} />} />
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
});

const section = (name) => screen.findByRole('region', { name });

describe('브리핑', () => {
  it('/community 는 브리핑으로 가고, 탭 순서는 브리핑 · 뉴스 · 시세 · 게시판 · 투표', async () => {
    renderAt('/community');
    await section('시세');
    expect(screen.getByTestId('location')).toHaveTextContent('/community/briefing');
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
    expect(within(await section('시세')).getByText('예시 데이터')).toBeInTheDocument();
    expect(await within(await section('최근 거래')).findAllByRole('listitem')).not.toHaveLength(0);

    // 브리핑은 적게 부른다(size)
    expect(api.getCommunityPostList).toHaveBeenCalledWith(expect.objectContaining({ size: 5 }));
    expect(api.getCommunityPollList).toHaveBeenCalledWith(expect.objectContaining({ status: 'OPEN', size: 3 }));
  });

  it('더보기 › 는 해당 탭으로', async () => {
    renderAt('/community/briefing');
    const cases = [
      ['최근 게시글', '/community/board'],
      ['최근 뉴스', '/community/news'],
      ['최근 투표', '/community/polls'],
      ['시세', '/community/market'],
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
    expect(screen.getByTestId('location')).toHaveTextContent('/community/posts/post-1');
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

  it('시세를 아직 모으는 단지면 시세 · 거래 섹션에 안내 한 줄(나머지 섹션은 그대로)', async () => {
    api.getMyBuildings.mockResolvedValue([{ ...BUILDING, complexId: 'complex-not-in-example-data' }]);
    renderAt('/community/briefing');
    expect(await within(await section('시세')).findByText('시세를 모으는 중입니다')).toBeInTheDocument();
    expect(await within(await section('최근 거래')).findByText('최근 거래가 없습니다')).toBeInTheDocument();
    expect(await within(await section('최근 게시글')).findAllByRole('button', { name: /게시글 \d/ })).toHaveLength(5);
  });

  it('비었을 때는 섹션 안 한 줄', async () => {
    api.getCommunityPostList.mockResolvedValue(page([]));
    api.getCommunityPollList.mockResolvedValue(page([]));
    renderAt('/community/briefing');
    expect(await within(await section('최근 게시글')).findByText('아직 올라온 글이 없습니다')).toBeInTheDocument();
    expect(await within(await section('최근 투표')).findByText('아직 올라온 투표가 없습니다')).toBeInTheDocument();
  });
});
