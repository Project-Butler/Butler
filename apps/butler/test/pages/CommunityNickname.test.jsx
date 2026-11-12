import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityPage } from '../../src/pages/CommunityPage';

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
const LABEL = '잠실한빛아파트 103동 임대인';
const NO_NICKNAME = { nickname: null, nextChangeAt: null, previewLabel: LABEL };
const WITH_NICKNAME = { nickname: '삼전동 부자', nextChangeAt: null, previewLabel: LABEL };
const listPage = (items) => ({
  data: items,
  meta: { page: 1, size: 20, total: items.length, hasNext: false, region: REGION, canWrite: true, writeBlockedReason: null },
});
const POST = {
  id: 'post-1',
  legalDongCode: REGION.legalDongCode,
  category: 'FREE',
  title: '관리비 고지서 항목 문의',
  authorNickname: '송파 집주인',
  authorLabel: '잠실서강아파트 201동 임대인',
  commentCount: 1,
  isMine: false,
  createdAt: '2026-11-04T01:00:00.000Z',
  canWrite: true,
  writeBlockedReason: null,
  locked: false,
  body: '이번 달 고지서에 처음 보는 항목이 있어요',
  updatedAt: '2026-11-04T01:00:00.000Z',
  // 닉네임을 정하기 전에 쓴 옛 댓글 — 표기만
  comments: [{ id: 'c-1', body: '저희도 같은 항목이 있었어요', authorNickname: null, authorLabel: '잠실한빛아파트 101동 임대인', isMine: false, createdAt: '2026-11-04T02:00:00.000Z' }],
};
const apiError = (status, code, message) => Object.assign(new Error(message), { response: { status, data: { error: { code, message, details: [] } } } });

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
// 파일의 첫 렌더는 화면 코드를 처음 불러와 전체 실행 때 1초를 넘기기도 한다 — 첫 대기만 여유를 둔다
const FIRST_RENDER = { timeout: 3000 };
const dialog = () => screen.getByRole('dialog', { name: '커뮤니티 닉네임' });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.getMyBuildings.mockResolvedValue([BUILDING]);
  api.getCommunityProfile.mockResolvedValue(NO_NICKNAME);
  api.getCommunityPostList.mockResolvedValue(listPage([POST, { ...POST, id: 'post-2', title: '옛 글', authorNickname: null }]));
  api.getCommunityPost.mockResolvedValue(POST);
});

describe('닉네임', () => {
  it('머리: 없으면 "닉네임 정하기" → 대화상자(설명 · 미리보기 · 규칙) → 저장하면 "닉네임 · …"', async () => {
    api.putCommunityProfile.mockResolvedValue(WITH_NICKNAME);
    renderAt('/community/board');
    await userEvent.click(await screen.findByRole('button', { name: '닉네임 정하기' }, FIRST_RENDER));

    expect(within(dialog()).getByText("글과 댓글에 '닉네임 (단지명 동 임대인)' 으로 보입니다")).toBeInTheDocument();
    expect(within(dialog()).getByText('2~12자 · 한글 · 영문 · 숫자 · 30일에 한 번 바꿀 수 있어요')).toBeInTheDocument();
    // 미리보기 줄: 입력 전에는 "닉네임 (…)", 입력하면 그 값
    expect(within(dialog()).getByText(`(${LABEL})`)).toBeInTheDocument();
    expect(within(dialog()).getByText('닉네임', { selector: 'span' })).toBeInTheDocument();
    await userEvent.type(within(dialog()).getByLabelText('닉네임'), '삼전동 부자');
    expect(within(dialog()).getByText('삼전동 부자', { selector: 'span' })).toBeInTheDocument();

    api.getCommunityProfile.mockResolvedValue(WITH_NICKNAME);
    await userEvent.click(within(dialog()).getByRole('button', { name: '저장' }));
    expect(api.putCommunityProfile.mock.calls[0][0]).toEqual({ nickname: '삼전동 부자', complexId: 'complex-1' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('button', { name: '닉네임 · 삼전동 부자' })).toBeInTheDocument();
  });

  it('오류는 칸 아래 한 줄(이미 쓰는 닉네임 409) — 고쳐 쓰면 사라진다', async () => {
    api.putCommunityProfile.mockRejectedValue(apiError(409, 'COMMUNITY_NICKNAME_TAKEN', '이미 쓰는 닉네임입니다.'));
    renderAt('/community/board');
    await userEvent.click(await screen.findByRole('button', { name: '닉네임 정하기' }, FIRST_RENDER));
    const input = within(dialog()).getByLabelText('닉네임');
    await userEvent.type(input, 'Rich Kim');
    await userEvent.click(within(dialog()).getByRole('button', { name: '저장' }));

    expect(await within(dialog()).findByText('이미 쓰는 닉네임입니다.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(input, '2');
    expect(within(dialog()).queryByText('이미 쓰는 닉네임입니다.')).not.toBeInTheDocument();
  });

  it('바꾼 지 30일이 안 됐으면 다음 바꿀 수 있는 날을 보여 주고 저장을 막는다', async () => {
    api.getCommunityProfile.mockResolvedValue({ ...WITH_NICKNAME, nextChangeAt: '2026-12-05T03:00:00.000Z' });
    renderAt('/community/board');
    await userEvent.click(await screen.findByRole('button', { name: '닉네임 · 삼전동 부자' }, FIRST_RENDER));
    expect(within(dialog()).getByText('2026-12-05부터 바꿀 수 있어요')).toBeInTheDocument();
    const input = within(dialog()).getByLabelText('닉네임');
    expect(input).toHaveValue('삼전동 부자');
    await userEvent.clear(input);
    await userEvent.type(input, '새 이름');
    expect(within(dialog()).getByRole('button', { name: '저장' })).toBeDisabled();
    // Esc 로 닫힌다
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('닉네임 없이 [글쓰기]: 대화상자를 먼저 — 저장하면 글쓰기 화면으로 간다', async () => {
    api.putCommunityProfile.mockResolvedValue(WITH_NICKNAME);
    renderAt('/community/board');
    await screen.findByRole('button', { name: '닉네임 정하기' }, FIRST_RENDER);
    await userEvent.click(await screen.findByRole('button', { name: '글쓰기' }));
    expect(dialog()).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/community/board');

    await userEvent.type(within(dialog()).getByLabelText('닉네임'), '삼전동 부자');
    await userEvent.click(within(dialog()).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/community/posts/new'));
  });

  it('닉네임 없이 댓글 [등록]: 대화상자를 먼저 — 저장해도 쓰던 댓글이 남고, 다시 누르면 등록된다', async () => {
    api.putCommunityProfile.mockResolvedValue(WITH_NICKNAME);
    api.postCommunityComment.mockResolvedValue({ id: 'c-2' });
    renderAt('/community/posts/post-1');
    await screen.findByRole('button', { name: '닉네임 정하기' }, FIRST_RENDER);
    const comment = await screen.findByRole('textbox', { name: '댓글' });
    await userEvent.type(comment, '저도 궁금해요');
    await userEvent.click(screen.getByRole('button', { name: '등록' }));
    expect(dialog()).toBeInTheDocument();
    expect(api.postCommunityComment).not.toHaveBeenCalled();

    api.getCommunityProfile.mockResolvedValue(WITH_NICKNAME);
    await userEvent.type(within(dialog()).getByLabelText('닉네임'), '삼전동 부자');
    await userEvent.click(within(dialog()).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(comment).toHaveValue('저도 궁금해요');
    expect(api.postCommunityComment).not.toHaveBeenCalled();

    await screen.findByRole('button', { name: '닉네임 · 삼전동 부자' });
    await userEvent.click(screen.getByRole('button', { name: '등록' }));
    await waitFor(() => expect(api.postCommunityComment).toHaveBeenCalledTimes(1));
    expect(api.postCommunityComment.mock.calls[0][0]).toEqual({ postId: 'post-1', complexId: 'complex-1', body: '저도 궁금해요' });
  });

  it('닉네임을 아직 모를 때 서버가 COMMUNITY_NICKNAME_REQUIRED 로 막으면 대화상자 — 댓글은 그대로, 오류 띠 없음', async () => {
    api.getCommunityProfile.mockRejectedValue(apiError(500, 'INTERNAL_ERROR', '잠시 후 다시 시도해 주세요.'));
    api.postCommunityComment.mockRejectedValue(apiError(403, 'COMMUNITY_NICKNAME_REQUIRED', '커뮤니티 닉네임을 먼저 정해 주세요.'));
    renderAt('/community/posts/post-1');
    const comment = await screen.findByRole('textbox', { name: '댓글' }, FIRST_RENDER);
    await userEvent.type(comment, '저도 궁금해요');
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    expect(await screen.findByRole('dialog', { name: '커뮤니티 닉네임' })).toBeInTheDocument();
    expect(comment).toHaveValue('저도 궁금해요');
    expect(screen.queryByText('커뮤니티 닉네임을 먼저 정해 주세요.')).not.toBeInTheDocument();
  });

  it('작성자 칸: "닉네임 (표기)", 닉네임이 없는 옛 글 · 댓글은 표기만 — 목록 · 상세 · 댓글', async () => {
    renderAt('/community/board');
    const rows = (await screen.findAllByRole('row', {}, FIRST_RENDER)).slice(1);
    expect(within(rows[0]).getByText('송파 집주인')).toBeInTheDocument();
    expect(within(rows[0]).getByText('(잠실서강아파트 201동 임대인)')).toBeInTheDocument();
    expect(within(rows[1]).getByText('잠실서강아파트 201동 임대인')).toBeInTheDocument();
    expect(within(rows[1]).queryByText(/\(/)).not.toBeInTheDocument();

    await userEvent.click(within(rows[0]).getByRole('button', { name: POST.title }));
    expect(await screen.findByRole('heading', { name: POST.title })).toBeInTheDocument();
    const article = screen.getByRole('article');
    expect(within(article).getByText('송파 집주인')).toBeInTheDocument();
    expect(within(article).getByText('(잠실서강아파트 201동 임대인)')).toBeInTheDocument();
    const comments = screen.getByRole('region', { name: /댓글/ });
    expect(within(comments).getByText('잠실한빛아파트 101동 임대인')).toBeInTheDocument();
  });
});
