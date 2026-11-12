import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityPage } from '../../src/landlord/web/pages/CommunityPage';

// 글 · 투표를 지운 직후 지운 상세를 다시 부르지 않는다(11/12 — 전에는 상세 캐시를 화면을 떠나기 전에 버려 404 가 한 번 났다).
// 목록에서 눌러 들어와야 "목록으로" 가 브라우저 뒤로(history.go(-1))가 되고, 뒤로는 popstate 가 늦게 와서 그사이 상세가 한 번 더 그려진다 —
// 그 순간 캐시가 없으면 다시 부른다. 그래서 BrowserRouter(jsdom 도 popstate 가 늦다)로 목록부터 연다.
const api = vi.hoisted(() => ({
  getMyBuildings: vi.fn(),
  getCommunityProfile: vi.fn(),
  putCommunityProfile: vi.fn(),
  getCommunityPost: vi.fn(),
  getCommunityPostList: vi.fn(),
  getCommunityPoll: vi.fn(),
  getCommunityPollList: vi.fn(),
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
    COMMUNITY_PROFILE: 'community_profile',
    COMMUNITY_POSTS: 'community_posts',
    COMMUNITY_POST_DETAIL: 'community_post',
    COMMUNITY_POLLS: 'community_polls',
    COMMUNITY_POLL_DETAIL: 'community_poll',
  },
}));

const REGION = { legalDongCode: '1171010100', dongName: '잠실동', fullName: '서울특별시 송파구 잠실동' };
const BUILDING = {
  complexId: 'complex-1',
  name: '잠실한빛아파트',
  legalDongCode: REGION.legalDongCode,
  regionName: REGION.fullName,
  unitCount: 2,
  unitAreas: [84.97],
  memberCount: 3,
  verificationStatus: 'VERIFIED',
  verifyPropertyId: null,
};
const POST = {
  id: 'post-1',
  legalDongCode: REGION.legalDongCode,
  category: 'FREE',
  title: '지울 글',
  authorNickname: '석촌호수뷰',
  authorLabel: '잠실한빛아파트 103동 임대인',
  commentCount: 0,
  isMine: true,
  createdAt: '2026-11-04T01:00:00.000Z',
  canWrite: true,
  writeBlockedReason: null,
  locked: false,
  body: '곧 지웁니다',
  updatedAt: '2026-11-04T01:00:00.000Z',
  comments: [],
};
const POLL = {
  id: 'poll-1',
  scope: 'REGION',
  complexId: null,
  complexName: null,
  region: REGION,
  title: '지울 투표',
  description: null,
  authorNickname: '석촌호수뷰',
  authorLabel: '잠실한빛아파트 103동 임대인',
  isMine: true,
  closesAt: '2099-01-01T14:59:00.000Z',
  isClosed: false,
  voteCount: 0,
  hasVoted: false,
  myOptionId: null,
  isEligible: true,
  canVote: true,
  myUnitCount: 2,
  myWeight: 2,
  canWrite: true,
  writeBlockedReason: null,
  locked: false,
  options: [
    { id: 'opt-1', label: '가', position: 1 },
    { id: 'opt-2', label: '나', position: 2 },
  ],
  createdAt: '2026-11-04T01:00:00.000Z',
};
const page = (items) => ({ data: items, meta: { page: 1, size: 20, total: items.length, hasNext: false, region: REGION, canWrite: true, writeBlockedReason: null } });

const LocationProbe = () => <output data-testid="location">{useLocation().pathname}</output>;
const renderAt = (path) => {
  window.history.replaceState(null, '', `/landlord${path}`);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <LocationProbe />
        <Routes>
          <Route path="/landlord/community/*" element={<CommunityPage onNavigate={vi.fn()} />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>,
  );
  return client;
};
// 파일의 첫 렌더는 화면 코드를 처음 불러와 전체 실행 때 1초를 넘기기도 한다 — 첫 대기만 여유를 둔다
const FIRST_RENDER = { timeout: 3000 };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  api.getMyBuildings.mockResolvedValue([BUILDING]);
  api.getCommunityProfile.mockResolvedValue({ nickname: '석촌호수뷰', nextChangeAt: null, previewLabel: '잠실한빛아파트 103동 임대인' });
  api.getCommunityPost.mockResolvedValue(POST);
  api.getCommunityPoll.mockResolvedValue(POLL);
  api.getCommunityPostList.mockResolvedValue(page([POST]));
  api.getCommunityPollList.mockResolvedValue(page([POLL]));
  api.deleteCommunityPost.mockResolvedValue(null);
  api.deleteCommunityPoll.mockResolvedValue(null);
});

describe('지운 직후 상세를 다시 부르지 않는다', () => {
  it('글: [삭제] → 게시판 목록으로, 지운 글 상세 조회는 처음 한 번뿐', async () => {
    const client = renderAt('/community/board');
    await userEvent.click(await screen.findByRole('button', { name: '지울 글' }, FIRST_RENDER));
    await screen.findByRole('heading', { name: '지울 글' });
    expect(api.getCommunityPost).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/landlord/community/board'));
    expect(api.deleteCommunityPost.mock.calls[0][0]).toBe('post-1');
    // 목록을 다시 부를 때까지 기다린 뒤 센다(지운 뒤 목록 무효화)
    await waitFor(() => expect(api.getCommunityPostList).toHaveBeenCalledTimes(2));
    expect(api.getCommunityPost).toHaveBeenCalledTimes(1);
    // 떠난 뒤에는 지운 글의 상세 캐시가 남지 않는다
    expect(client.getQueryCache().find({ queryKey: ['community_post', 'post-1'] })).toBeUndefined();
  });

  it('투표: [삭제](참여 0) → 투표 목록으로, 지운 투표 상세 조회는 처음 한 번뿐', async () => {
    const client = renderAt('/community/polls');
    await userEvent.click(await screen.findByRole('button', { name: /지울 투표/ }, FIRST_RENDER));
    await screen.findByRole('heading', { name: '지울 투표' });
    expect(api.getCommunityPoll).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/landlord/community/polls'));
    expect(api.deleteCommunityPoll.mock.calls[0][0]).toBe('poll-1');
    await waitFor(() => expect(api.getCommunityPollList).toHaveBeenCalledTimes(2));
    expect(api.getCommunityPoll).toHaveBeenCalledTimes(1);
    expect(client.getQueryCache().find({ queryKey: ['community_poll', 'poll-1'] })).toBeUndefined();
  });
});
