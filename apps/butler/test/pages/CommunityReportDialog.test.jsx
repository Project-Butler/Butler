import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityPage } from '../../src/landlord/web/pages/CommunityPage';

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
  title: '관리비 고지서 항목 문의',
  authorNickname: '송파 집주인',
  authorLabel: '잠실서강아파트 201동 임대인',
  commentCount: 0,
  isMine: false,
  createdAt: '2026-11-04T01:00:00.000Z',
  canWrite: true,
  writeBlockedReason: null,
  locked: false,
  body: '이번 달 고지서에 처음 보는 항목이 있어요',
  updatedAt: '2026-11-04T01:00:00.000Z',
  comments: [],
};

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

const openReport = async () => {
  renderAt('/community/posts/post-1');
  const button = await screen.findByRole('button', { name: '신고' }, FIRST_RENDER);
  await userEvent.click(button);
  return { button, dialog: screen.getByRole('dialog', { name: '신고' }) };
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.getMyBuildings.mockResolvedValue([BUILDING]);
  api.getCommunityProfile.mockResolvedValue({ nickname: '석촌호수뷰', nextChangeAt: null, previewLabel: '잠실한빛아파트 103동 임대인' });
  api.getCommunityPost.mockResolvedValue(POST);
});

describe('신고 대화상자', () => {
  it('덮개는 document.body 에 바로 그린다 — 글 상세 틀(space-y) 안이 아니어서 위 여백이 붙지 않는다', async () => {
    const { dialog } = await openReport();
    const overlay = dialog.parentElement;

    expect(overlay).toHaveClass('fixed', 'inset-0');
    expect(overlay.parentElement).toBe(document.body);
    // 글 제목이 든 화면 틀 안에는 대화상자가 없다
    const frame = screen.getByRole('heading', { name: POST.title }).closest('.max-w-6xl');
    expect(frame).not.toBeNull();
    expect(frame.contains(dialog)).toBe(false);
  });

  it('portal 로 옮겨도 그대로: 열면 첫 칸에 포커스, Esc 로 닫으면 [신고] 로 돌아온다', async () => {
    const { button, dialog } = await openReport();

    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('사유를 골라 [신고하기] → 창이 닫히고 "신고가 접수되었습니다."', async () => {
    api.postCommunityReport.mockResolvedValue({ id: 'report-1' });
    const { dialog } = await openReport();

    await userEvent.click(within(dialog).getByRole('radio', { name: '도배·스팸' }));
    await userEvent.click(within(dialog).getByRole('button', { name: '신고하기' }));
    expect(api.postCommunityReport.mock.calls[0][0]).toEqual({ postId: 'post-1', reason: 'SPAM', detail: undefined });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('신고가 접수되었습니다.')).toBeInTheDocument();
  });
});
