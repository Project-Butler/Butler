import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityPage } from '../../src/landlord/web/pages/CommunityPage';

// 투표권 = 범위 안 인증 호실 수(PC 명세 v3 6절): 참여 전 표 수 안내 · 참여 뒤 "참여함 · N표" · 결과 "참여 n명 · 총 m표".
const api = vi.hoisted(() => ({
  getMyBuildings: vi.fn(),
  getCommunityPoll: vi.fn(),
  postCommunityVote: vi.fn(),
  deleteCommunityPoll: vi.fn(),
}));

vi.mock('@butler/api-client', () => ({
  ...api,
  queryKey: {
    COMMUNITY_MY_BUILDINGS: 'community_my_buildings',
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
  unitCount: 3,
  unitAreas: [84.97],
  memberCount: 3,
  verificationStatus: 'VERIFIED',
  verifyPropertyId: null,
};
const OPTIONS = [
  { id: 'opt-1', label: '지금 위치 유지', position: 1 },
  { id: 'opt-2', label: '정문 쪽으로 이동', position: 2 },
];
const poll = (overrides = {}) => ({
  id: 'poll-1',
  scope: 'REGION',
  complexId: null,
  complexName: null,
  region: REGION,
  title: '분리수거장 위치 변경 의견',
  description: null,
  authorLabel: '잠실서강아파트 201동 임대인',
  isMine: false,
  closesAt: '2099-01-01T14:59:00.000Z',
  isClosed: false,
  voteCount: 1,
  hasVoted: false,
  myOptionId: null,
  isEligible: true,
  canVote: true,
  myUnitCount: 3,
  myWeight: 3,
  canWrite: true,
  writeBlockedReason: null,
  locked: false,
  options: OPTIONS,
  createdAt: '2026-11-05T01:00:00.000Z',
  ...overrides,
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

describe('투표 표 수', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getMyBuildings.mockResolvedValue([BUILDING]);
  });

  it('참여 전: "인증한 호실 3개 — 3표로 반영됩니다" 와 "가진 표 3표를 한 선택지에 모두 반영합니다"', async () => {
    api.getCommunityPoll.mockResolvedValue(poll());
    renderAt('/community/polls/poll-1');

    expect(await screen.findByRole('heading', { name: '분리수거장 위치 변경 의견' }, FIRST_RENDER)).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '인증한 호실 3개 — 3표로 반영됩니다.')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '가진 표 3표를 한 선택지에 모두 반영합니다')).toBeInTheDocument();
    expect(screen.queryByText(/1표만 반영/)).not.toBeInTheDocument();
  });

  it('참여 뒤: 버튼이 "참여함 · 3표" 로 잠기고 호실 안내 줄은 빠진다', async () => {
    api.getCommunityPoll.mockResolvedValue(poll({ hasVoted: true, myOptionId: 'opt-1', canVote: false }));
    renderAt('/community/polls/poll-1');

    expect(await screen.findByRole('button', { name: '참여함 · 3표' })).toBeDisabled();
    expect(screen.queryByText(/인증한 호실/)).not.toBeInTheDocument();
  });

  it('마감 뒤 결과: "참여 2명 · 총 4표", 선택지마다 표 수 · 비율, 내 선택에 "내 선택 · 3표"', async () => {
    api.getCommunityPoll.mockResolvedValue(
      poll({
        isClosed: true,
        canVote: false,
        hasVoted: true,
        myOptionId: 'opt-1',
        voteCount: 2,
        weightTotal: 4,
        options: [
          { ...OPTIONS[0], voteCount: 1, weightTotal: 3, percent: 75 },
          { ...OPTIONS[1], voteCount: 1, weightTotal: 1, percent: 25 },
        ],
      }),
    );
    renderAt('/community/polls/poll-1');

    expect(await screen.findByText((_, el) => el?.tagName === 'P' && el.textContent === '참여 2명 · 총 4표')).toBeInTheDocument();
    expect(screen.getByText('3표 · 75%')).toBeInTheDocument();
    expect(screen.getByText('1표 · 25%')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '내 선택 · 3표')).toBeInTheDocument();
  });
});
