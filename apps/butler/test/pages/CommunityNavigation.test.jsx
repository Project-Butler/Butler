// 커뮤니티 안의 이동은 절대 경로(navigate('/…'))로 한다. 앱이 /landlord 아래에 올라가므로
// 탭·글 열기·글쓰기·투표·건물 전환 같은 이동이 모두 /landlord/community/… 로 가는지 확인한다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityPage } from '../../src/landlord/web/pages/CommunityPage';

// CommunityPage가 import하는 화면들이 쓰는 api 함수를 모두 목으로 둔다(없으면 import 시점에 오류가 난다).
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
const building = (complexId, name) => ({
  complexId,
  name,
  legalDongCode: REGION.legalDongCode,
  regionName: REGION.fullName,
  unitCount: 2,
  unitAreas: [84.97],
  memberCount: 3,
  verificationStatus: 'VERIFIED',
  verifyPropertyId: null,
});
const BUILDINGS = [building('complex-1', '잠실한빛아파트'), building('complex-2', '잠실서강아파트')];
const page = (items, meta = {}) => ({
  data: items,
  meta: { page: 1, size: 20, total: items.length, hasNext: false, region: REGION, canWrite: true, writeBlockedReason: null, ...meta },
});
const POST = { id: 'post-1', category: 'FREE', title: '관리비 문의', authorLabel: '103동 임대인', commentCount: 0, isMine: false, createdAt: '2026-10-22T01:00:00.000Z' };
const POLL = { id: 'poll-1', scope: 'REGION', complexId: null, title: '엘리베이터 교체', closesAt: '2099-01-01T00:00:00.000Z', isClosed: false, voteCount: 1, hasVoted: false };
const POST_DETAIL = { ...POST, legalDongCode: REGION.legalDongCode, body: '본문', updatedAt: POST.createdAt, comments: [], canWrite: true, writeBlockedReason: null, locked: false };

const LocationProbe = () => {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{pathname + search}</output>;
};

const renderAt = (path) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/landlord/community/*" element={<CommunityPage onNavigate={vi.fn()} />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};
const location = () => screen.getByTestId('location').textContent;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.getMyBuildings.mockResolvedValue(BUILDINGS);
  api.getCommunityPostList.mockResolvedValue(page([POST]));
  api.getCommunityPollList.mockResolvedValue(page([POLL]));
  api.getCommunityNewsList.mockResolvedValue(page([], { sidoFallback: false }));
  api.getCommunityPost.mockResolvedValue(POST_DETAIL);
});

describe('커뮤니티 이동은 /landlord/community 아래로 간다', () => {
  it.each([
    ['뉴스', '/landlord/community/news'],
    ['시세', '/landlord/community/market'],
    ['게시판', '/landlord/community/board'],
    ['투표', '/landlord/community/polls'],
    ['브리핑', '/landlord/community/briefing'],
  ])('탭 [%s]', async (label, expected) => {
    const user = userEvent.setup();
    renderAt(expected === '/landlord/community/briefing' ? '/landlord/community/news' : '/landlord/community/briefing');
    await user.click(await screen.findByRole('button', { name: label }));
    expect(location()).toBe(expected);
  });

  it('게시판: 글 제목을 누르면 글 상세로', async () => {
    const user = userEvent.setup();
    renderAt('/landlord/community/board');
    await user.click(await screen.findByRole('button', { name: '관리비 문의' }));
    expect(location()).toBe('/landlord/community/posts/post-1');
  });

  it('게시판: [글쓰기]는 새 글로', async () => {
    const user = userEvent.setup();
    renderAt('/landlord/community/board');
    await user.click(await screen.findByRole('button', { name: '글쓰기' }));
    expect(location()).toBe('/landlord/community/posts/new');
  });

  it('게시판: 분류를 고른 상태에서 [글쓰기]를 누르면 category가 따라간다', async () => {
    const user = userEvent.setup();
    renderAt('/landlord/community/board?category=MARKET');
    await user.click(await screen.findByRole('button', { name: '글쓰기' }));
    expect(location()).toBe('/landlord/community/posts/new?category=MARKET');
  });

  it('투표: [투표 만들기]는 새 투표로, 카드를 열면 투표 상세로', async () => {
    const user = userEvent.setup();
    renderAt('/landlord/community/polls');
    await user.click(await screen.findByRole('button', { name: /투표 만들기/ }));
    expect(location()).toBe('/landlord/community/polls/new');
  });

  it('투표: 카드를 누르면 투표 상세로', async () => {
    const user = userEvent.setup();
    renderAt('/landlord/community/polls');
    await user.click(await screen.findByText('엘리베이터 교체'));
    expect(location()).toBe('/landlord/community/polls/poll-1');
  });

  it('하위 화면(글 상세)에서 건물을 바꾸면 그 탭 목록(게시판)으로 간다', async () => {
    const user = userEvent.setup();
    renderAt('/landlord/community/posts/post-1');
    await user.click(await screen.findByRole('button', { name: /건물 바꾸기/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: /잠실서강아파트/ }));
    expect(location()).toBe('/landlord/community/board');
  });
});
