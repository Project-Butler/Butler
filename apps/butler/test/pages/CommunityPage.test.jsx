import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

const REGION = { legalDongCode: '1171010100', dongName: '잠실동', fullName: '서울특별시 송파구 잠실동' };
const building = (overrides = {}) => ({
  complexId: 'complex-1',
  name: '잠실한빛아파트',
  legalDongCode: REGION.legalDongCode,
  regionName: REGION.fullName,
  unitCount: 2,
  unitAreas: [84.97],
  memberCount: 3,
  verificationStatus: 'VERIFIED',
  verifyPropertyId: null,
  ...overrides,
});
const UNVERIFIED = building({ verificationStatus: 'UNVERIFIED', verifyPropertyId: 'property-9' });

const LOCKED_POST = {
  id: 'post-1',
  legalDongCode: REGION.legalDongCode,
  category: 'FREE',
  title: '관리비 고지서 항목 문의',
  authorLabel: '잠실한빛아파트 103동 임대인',
  commentCount: 3,
  isMine: false,
  createdAt: '2026-10-22T01:00:00.000Z',
  canWrite: false,
  writeBlockedReason: 'UNVERIFIED',
  locked: true,
};
const OPEN_POST = {
  ...LOCKED_POST,
  canWrite: true,
  writeBlockedReason: null,
  locked: false,
  body: '이번 달 고지서에 처음 보는 항목이 있어요',
  updatedAt: '2026-10-22T01:00:00.000Z',
  comments: [{ id: 'c-1', body: '저희도 같은 항목이 있었어요', authorLabel: '잠실서강아파트 201동 임대인', isMine: false, createdAt: '2026-10-22T02:00:00.000Z' }],
};
const LOCKED_POLL = {
  id: 'poll-1',
  scope: 'REGION',
  complexId: null,
  complexName: null,
  region: REGION,
  title: '지하주차장 LED 교체 비용 분담 방식',
  closesAt: '2099-01-01T14:59:00.000Z',
  isClosed: false,
  voteCount: 4,
  canWrite: false,
  writeBlockedReason: 'UNVERIFIED',
  locked: true,
  createdAt: '2026-10-22T01:00:00.000Z',
};
const listPage = (items, meta = {}) => ({
  data: items,
  meta: { page: 1, size: 20, total: items.length, hasNext: false, region: REGION, canWrite: false, writeBlockedReason: 'UNVERIFIED', ...meta },
});

const renderAt = (path, onNavigate = vi.fn()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/community/*" element={<CommunityPage onNavigate={onNavigate} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return onNavigate;
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.getCommunityPostList.mockResolvedValue(listPage([]));
  api.getCommunityPollList.mockResolvedValue(listPage([]));
  api.getCommunityNewsList.mockResolvedValue(listPage([], { sidoFallback: false }));
});

describe('인증 전 미리보기', () => {
  it('잠긴 글: 제목 · 작성자는 보이고 본문 자리에 잠금 카드, 댓글 · 신고 없음', async () => {
    api.getMyBuildings.mockResolvedValue([UNVERIFIED]);
    api.getCommunityPost.mockResolvedValue(LOCKED_POST);
    renderAt('/community/posts/post-1');

    expect(await screen.findByRole('heading', { name: LOCKED_POST.title })).toBeInTheDocument();
    expect(screen.getByText(LOCKED_POST.authorLabel)).toBeInTheDocument();
    expect(screen.getByText('인증한 임대인만 볼 수 있어요')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /댓글/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /신고/ })).not.toBeInTheDocument();
  });

  it('[권리자 인증하기] 는 그 건물의 인증할 호실로 간다(잠금 카드 · 안내 줄 모두)', async () => {
    api.getMyBuildings.mockResolvedValue([UNVERIFIED]);
    api.getCommunityPost.mockResolvedValue(LOCKED_POST);
    const onNavigate = renderAt('/community/posts/post-1');

    await screen.findByText('인증한 임대인만 볼 수 있어요');
    const buttons = screen.getAllByRole('button', { name: '권리자 인증하기' });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) await userEvent.click(button);
    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(onNavigate).toHaveBeenCalledWith('propertyVerify', { propertyId: 'property-9' });
  });

  it('인증한 사람에게는 본문 · 댓글이 보이고 잠금 카드 · 안내 줄이 없다', async () => {
    api.getMyBuildings.mockResolvedValue([building()]);
    api.getCommunityPost.mockResolvedValue(OPEN_POST);
    renderAt('/community/posts/post-1');

    expect(await screen.findByText(OPEN_POST.body)).toBeInTheDocument();
    expect(screen.getByText(OPEN_POST.comments[0].body)).toBeInTheDocument();
    expect(screen.queryByText('인증한 임대인만 볼 수 있어요')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '권리자 인증하기' })).not.toBeInTheDocument();
  });

  it('잠긴 투표: 질문 · 참여 인원은 보이고 선택지 · 투표하기 대신 잠금 카드', async () => {
    api.getMyBuildings.mockResolvedValue([UNVERIFIED]);
    api.getCommunityPoll.mockResolvedValue(LOCKED_POLL);
    renderAt('/community/polls/poll-1');

    expect(await screen.findByRole('heading', { name: LOCKED_POLL.title })).toBeInTheDocument();
    expect(screen.getByText('인증한 임대인만 볼 수 있어요')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '선택지' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '투표하기' })).not.toBeInTheDocument();
  });

  it('게시판 목록: 머리 배지 "인증 전" · 안내 줄 · 글쓰기 비활성과 이유', async () => {
    api.getMyBuildings.mockResolvedValue([UNVERIFIED]);
    api.getCommunityPostList.mockResolvedValue(listPage([LOCKED_POST]));
    renderAt('/community/board');

    expect(await screen.findByText(LOCKED_POST.title)).toBeInTheDocument();
    expect(screen.getByText('인증 전')).toBeInTheDocument();
    expect(screen.getByText('권리자 인증을 마치면 글을 읽고 투표에 참여할 수 있어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /글쓰기/ })).toBeDisabled();
    expect(screen.getByText('글을 쓰려면 권리자 인증이 필요합니다')).toBeInTheDocument();
  });

  it('건물 바꾸기 줄에도 인증 전 · 만료 표시', async () => {
    api.getMyBuildings.mockResolvedValue([
      building(),
      building({ complexId: 'complex-2', name: '해운대서강아파트', legalDongCode: '2635010500', verificationStatus: 'EXPIRED', verifyPropertyId: 'property-7' }),
    ]);
    renderAt('/community/board');

    await userEvent.click(await screen.findByRole('button', { name: /건물 바꾸기/ }));
    const menu = screen.getByRole('menu', { name: '보유 건물' });
    const expiredRow = within(menu).getByRole('menuitemradio', { name: /해운대서강아파트/ });
    expect(within(expiredRow).getByText('인증 만료')).toBeInTheDocument();
    expect(within(within(menu).getByRole('menuitemradio', { name: /잠실한빛아파트/ })).queryByText(/인증/)).not.toBeInTheDocument();
  });

  it('등록한 호실이 없으면 빈 상태와 [호실 등록하기] → 호실 등록 화면', async () => {
    api.getMyBuildings.mockResolvedValue([]);
    const onNavigate = renderAt('/community/board');

    expect(await screen.findByText('아직 등록한 호실이 없습니다')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '호실 등록하기' }));
    expect(onNavigate).toHaveBeenCalledWith('propertyRegister');
  });
});
