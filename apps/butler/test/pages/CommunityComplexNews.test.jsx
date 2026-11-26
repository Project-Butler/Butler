import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityPage } from '../../src/landlord/web/pages/CommunityPage';

const api = vi.hoisted(() => ({
  getMyBuildings: vi.fn(),
  getCommunityPostList: vi.fn(),
  getCommunityPollList: vi.fn(),
  getCommunityNewsList: vi.fn(),
  getCommunityComplexNewsList: vi.fn(),
}));

vi.mock('@butler/api-client', () => ({
  ...api,
  queryKey: {
    COMMUNITY_MY_BUILDINGS: 'community_my_buildings',
    COMMUNITY_POSTS: 'community_posts',
    COMMUNITY_POLLS: 'community_polls',
    COMMUNITY_NEWS: 'community_news',
    COMMUNITY_COMPLEX_NEWS: 'community_complex_news',
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
  unitAreas: [84.97],
  memberCount: 3,
  verificationStatus: 'VERIFIED',
  verifyPropertyId: null,
};
const article = (key, scope, url = `https://news.example/${key}`) => ({
  id: key,
  scope,
  title: `${key} 기사`,
  url,
  publisher: '한빛일보',
  publishedAt: '2026-11-04T01:00:00.000Z',
});
const regionPage = (items, meta = {}) => ({
  data: items,
  meta: { page: 1, size: 5, total: items.length, hasNext: false, region: { ...REGION, sidoLabel: '서울' }, sidoFallback: false, ...meta },
});
const complexPage = (items, meta = {}) => ({
  data: items,
  meta: { page: 1, size: 5, total: items.length, hasNext: false, complex: { id: BUILDING.complexId, name: BUILDING.name, legalDongCode: REGION.legalDongCode }, ...meta },
});

const renderAt = (path) => {
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
};
// 파일의 첫 렌더는 화면 코드를 처음 불러와 전체 실행 때 1초를 넘기기도 한다 — 첫 대기만 여유를 둔다
const FIRST_RENDER = { timeout: 3000 };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.getMyBuildings.mockResolvedValue([BUILDING]);
  api.getCommunityPostList.mockResolvedValue(regionPage([]));
  api.getCommunityPollList.mockResolvedValue(regionPage([]));
  api.getCommunityNewsList.mockImplementation(async ({ scope }) =>
    regionPage(scope === 'NATIONWIDE' ? [article('전국1', 'NATIONWIDE')] : [1, 2, 3, 4, 5].map((i) => article(`송파${i}`, 'SIGUNGU'))),
  );
});

describe('우리 단지 뉴스', () => {
  it('브리핑: 단지 기사가 먼저(최대 2건, "우리 단지" 칩), 같은 기사는 한 번만, 모두 5건', async () => {
    // 단지 기사 셋 중 둘만, 그중 하나는 지역 묶음에도 있는 기사(같은 url)
    api.getCommunityComplexNewsList.mockResolvedValue(
      complexPage([article('단지1', 'COMPLEX', 'https://news.example/송파1'), article('단지2', 'COMPLEX'), article('단지3', 'COMPLEX')]),
    );
    renderAt('/community/briefing');
    const card = await screen.findByRole('region', { name: '최근 뉴스' }, FIRST_RENDER);
    const links = await within(card).findAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringMatching(/^우리 단지단지1 기사/),
      expect.stringMatching(/^우리 단지단지2 기사/),
      expect.stringContaining('송파2 기사'),
      expect.stringContaining('송파3 기사'),
      expect.stringContaining('송파4 기사'),
    ]);
    expect(within(card).getByText(`${BUILDING.name} · 송파구`)).toBeInTheDocument();
    expect(api.getCommunityComplexNewsList).toHaveBeenCalledWith(expect.objectContaining({ complexId: BUILDING.complexId, size: 2 }));
  });

  it('브리핑: 단지 기사를 못 불러와도 지역 기사 5건', async () => {
    api.getCommunityComplexNewsList.mockRejectedValue(new Error('boom'));
    renderAt('/community/briefing');
    const card = await screen.findByRole('region', { name: '최근 뉴스' }, FIRST_RENDER);
    const links = await within(card).findAllByRole('link');
    expect(links).toHaveLength(5);
    expect(within(card).queryByText('우리 단지')).not.toBeInTheDocument();
  });

  // 뉴스 탭: "우리 단지" 카드 없이 "우리 지역" · "전국 정책" 두 카드. 단지 기사는 "우리 지역" 맨 위에 최대 3건
  const localCard = () => screen.getByRole('heading', { name: '우리 지역' }).closest('div.overflow-hidden');
  const expectNoComplexCard = () => {
    expect(screen.queryByRole('heading', { name: '우리 단지' })).not.toBeInTheDocument();
    expect(screen.queryByText('단지 이름이 제목에 들어간 기사')).not.toBeInTheDocument();
    expect(screen.queryByText('아직 이 단지 이름이 들어간 기사가 없습니다')).not.toBeInTheDocument();
  };

  it('뉴스 탭: 단지 기사 5건 → 우리 지역 맨 위에 최신 3건("우리 단지" 칩), 그 아래 구 기사', async () => {
    // 서버가 더 많이 돌려줘도 3건에서 끊는다
    api.getCommunityComplexNewsList.mockResolvedValue(
      complexPage([1, 2, 3, 4, 5].map((i) => article(`단지${i}`, 'COMPLEX')), { size: 3, total: 5, hasNext: true }),
    );
    renderAt('/community/news');
    const list = await screen.findByRole('list', { name: '송파구 기사' }, FIRST_RENDER);
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringMatching(/^우리 단지단지1 기사/),
      expect.stringMatching(/^우리 단지단지2 기사/),
      expect.stringMatching(/^우리 단지단지3 기사/),
      ...[1, 2, 3, 4, 5].map((i) => expect.stringMatching(new RegExp(`^송파${i} 기사`))),
    ]);
    expect(within(list).getAllByText('우리 단지')).toHaveLength(3);
    expect(within(list).queryByText('단지4 기사')).not.toBeInTheDocument();
    expect(api.getCommunityComplexNewsList).toHaveBeenCalledWith(expect.objectContaining({ complexId: BUILDING.complexId, page: 1, size: 3 }));
    // 단지 기사의 다음 페이지는 부르지 않는다 — 카드의 더 보기는 구 기사 것뿐(이 구는 다음 페이지 없음)
    expect(within(localCard()).queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
    expectNoComplexCard();
    expect(screen.getByRole('list', { name: '전국 정책 기사' })).toBeInTheDocument();
  });

  it('뉴스 탭: 단지 기사와 구 기사에 같은 주소 → 단지 쪽으로 한 번만', async () => {
    api.getCommunityComplexNewsList.mockResolvedValue(
      complexPage([article('단지1', 'COMPLEX', 'https://news.example/송파1'), article('단지2', 'COMPLEX')]),
    );
    renderAt('/community/news');
    const list = await screen.findByRole('list', { name: '송파구 기사' }, FIRST_RENDER);
    expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual([
      expect.stringMatching(/^우리 단지단지1 기사/),
      expect.stringMatching(/^우리 단지단지2 기사/),
      ...[2, 3, 4, 5].map((i) => expect.stringMatching(new RegExp(`^송파${i} 기사`))),
    ]);
    expect(within(list).getAllByRole('link').filter((link) => link.getAttribute('href') === 'https://news.example/송파1')).toHaveLength(1);
  });

  it('뉴스 탭: 단지 기사 0건 → 구 기사만, 빈 안내 없음', async () => {
    api.getCommunityComplexNewsList.mockResolvedValue(complexPage([]));
    renderAt('/community/news');
    const list = await screen.findByRole('list', { name: '송파구 기사' }, FIRST_RENDER);
    expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual(
      [1, 2, 3, 4, 5].map((i) => expect.stringMatching(new RegExp(`^송파${i} 기사`))),
    );
    expect(within(list).queryByText('우리 단지')).not.toBeInTheDocument();
    expect(within(localCard()).queryByText(/기사가 없습니다/)).not.toBeInTheDocument();
    expectNoComplexCard();
    expect(screen.getByRole('list', { name: '전국 정책 기사' })).toBeInTheDocument();
  });

  it('뉴스 탭: 단지 기사를 못 불러와도 구 기사는 그대로', async () => {
    api.getCommunityComplexNewsList.mockRejectedValue(new Error('boom'));
    renderAt('/community/news');
    const list = await screen.findByRole('list', { name: '송파구 기사' }, FIRST_RENDER);
    expect(within(list).getAllByRole('link')).toHaveLength(5);
    expect(within(list).queryByText('우리 단지')).not.toBeInTheDocument();
  });

  it('뉴스 탭: 구 기사 더 보기는 지금처럼 — 단지 기사는 맨 위에 그대로, 다음 페이지가 아래에 붙는다', async () => {
    api.getCommunityComplexNewsList.mockResolvedValue(complexPage([article('단지1', 'COMPLEX')]));
    api.getCommunityNewsList.mockImplementation(async ({ scope, page }) => {
      if (scope === 'NATIONWIDE') return regionPage([article('전국1', 'NATIONWIDE')]);
      return page === 1
        ? regionPage([1, 2, 3, 4, 5].map((i) => article(`송파${i}`, 'SIGUNGU')), { size: 20, total: 6, hasNext: true })
        : regionPage([article('송파6', 'SIGUNGU')], { page: 2, size: 20, total: 6 });
    });
    renderAt('/community/news');
    const list = await screen.findByRole('list', { name: '송파구 기사' }, FIRST_RENDER);
    await userEvent.click(within(localCard()).getByRole('button', { name: '더 보기' }));
    expect(await within(list).findByText('송파6 기사')).toBeInTheDocument();
    expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual([
      expect.stringMatching(/^우리 단지단지1 기사/),
      ...[1, 2, 3, 4, 5, 6].map((i) => expect.stringMatching(new RegExp(`^송파${i} 기사`))),
    ]);
    expect(api.getCommunityNewsList).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'SIGUNGU', page: 2, size: 20 }));
    expect(api.getCommunityComplexNewsList).toHaveBeenCalledTimes(1);
  });

  it('뉴스 탭: 시 · 도 채움은 지금처럼 — 구 기사가 모자라면(sidoFallback) 아래 "서울 전체" 묶음, 단지 기사와 같은 주소는 뺀다', async () => {
    api.getCommunityComplexNewsList.mockResolvedValue(
      complexPage([article('단지1', 'COMPLEX'), article('단지2', 'COMPLEX', 'https://news.example/서울1')]),
    );
    api.getCommunityNewsList.mockImplementation(async ({ scope }) => {
      if (scope === 'NATIONWIDE') return regionPage([article('전국1', 'NATIONWIDE')]);
      if (scope === 'SIDO') return regionPage([1, 2, 3].map((i) => article(`서울${i}`, 'SIDO')));
      return regionPage([article('송파1', 'SIGUNGU'), article('송파2', 'SIGUNGU')], { sidoFallback: true });
    });
    renderAt('/community/news');
    const list = await screen.findByRole('list', { name: '송파구 기사' }, FIRST_RENDER);
    expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual([
      expect.stringMatching(/^우리 단지단지1 기사/),
      expect.stringMatching(/^우리 단지단지2 기사/),
      expect.stringMatching(/^송파1 기사/),
      expect.stringMatching(/^송파2 기사/),
    ]);
    expect(await screen.findByRole('heading', { name: '서울 전체' })).toBeInTheDocument();
    const sidoList = screen.getByRole('list', { name: '서울 전체 기사' });
    expect(within(sidoList).getAllByRole('link').map((link) => link.textContent)).toEqual([
      expect.stringMatching(/^서울2 기사/),
      expect.stringMatching(/^서울3 기사/),
    ]);
    expect(within(sidoList).queryByText('우리 단지')).not.toBeInTheDocument();
    expect(api.getCommunityNewsList).toHaveBeenCalledWith(expect.objectContaining({ scope: 'SIDO', page: 1, size: 10 }));
  });

  it('뉴스 탭: 구 기사가 넉넉하면(sidoFallback 아님) 시 · 도는 부르지 않는다', async () => {
    api.getCommunityComplexNewsList.mockResolvedValue(complexPage([article('단지1', 'COMPLEX')]));
    renderAt('/community/news');
    await screen.findByRole('list', { name: '송파구 기사' }, FIRST_RENDER);
    expect(screen.queryByRole('heading', { name: '서울 전체' })).not.toBeInTheDocument();
    expect(api.getCommunityNewsList).not.toHaveBeenCalledWith(expect.objectContaining({ scope: 'SIDO' }));
  });
});
