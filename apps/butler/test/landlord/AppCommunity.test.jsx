// 임대인 앱 커뮤니티(하단 탭 '커뮤니티'). 앱은 PC 커뮤니티의 모바일 버전 — 같은 문구 · 같은 데이터, 휴대폰에 맞는 배치(app/pages/CommunityApp*Page).
// 실패 조건: 앱에서 /community 가 '준비 중' · 상단 바 왼쪽이 단지 이름이 아님 · PC 머리(건물 바꾸기 드롭다운) · 탭 줄 · "← 목록으로"가 앱에 남음 ·
// 칩 줄 목록/주소가 PC 탭과 다름 · 하위 화면에 뒤로 가기 바가 없거나 주소로 바로 들어온 화면의 뒤로가 앱 밖으로 나감 · 미리보기 안내가 없음 ·
// 마감 전 투표에 득표가 보임 · [글쓰기]가 떠 있지 않음 · 게시판이 표로 나옴 · 좁은 폭에서 목록 제목이 사라질 수 있는 배치(한 줄 말줄임 ·
// 옆 칸과 폭 다툼 · 창 폭 클래스) · 건물 바꾸기 · 신고 · 닉네임이 가운데 대화상자로 뜨거나 문구가 PC 와 다름 ·
// 그 시트가 다른 앱 시트(BottomSheet)와 달리 X · [취소] · Esc · 바깥 · 저장(신고 · 건물 고르기) 뒤에 내려가지 않고 바로 사라지거나, 보내는 중 바깥을 누르면 닫힘 ·
// 뉴스에 "우리 단지" 카드가 남거나, 단지 기사가 PC 처럼 "우리 지역" 맨 위(최대 3건 · 칩은 날짜 줄 앞 · 같은 주소는 한 번)에 오지 않음.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getMyBuildings: vi.fn(),
  getCommunityProfile: vi.fn(),
  putCommunityProfile: vi.fn(),
  getCommunityPostList: vi.fn(),
  getCommunityPost: vi.fn(),
  postCommunityPost: vi.fn(),
  patchCommunityPost: vi.fn(),
  deleteCommunityPost: vi.fn(),
  postCommunityComment: vi.fn(),
  deleteCommunityComment: vi.fn(),
  postCommunityReport: vi.fn(),
  getCommunityPollList: vi.fn(),
  getCommunityPoll: vi.fn(),
  postCommunityPoll: vi.fn(),
  postCommunityVote: vi.fn(),
  deleteCommunityPoll: vi.fn(),
  getCommunityNewsList: vi.fn(),
  getCommunityComplexNewsList: vi.fn(),
  getComplexMarketPrices: vi.fn(),
  // 위 막대 말풍선(안 읽은 대화 수, docs/19 A0)
  getThreadList: vi.fn(async () => ({ data: [], meta: { page: 1, size: 100, total: 0, hasNext: false } })),
  getNotificationUnreadCount: vi.fn(),
}));

vi.mock('@butler/api-client', () => ({ ...api, queryKey: new Proxy({}, { get: (_, name) => String(name) }) }));

const { LandlordAppRoutes } = await import('../../src/landlord/app/LandlordAppRoutes');

const USER = { id: 'l-1', name: '최앱주', role: 'LANDLORD' };
const REGION = { legalDongCode: '1171010100', dongName: '잠실동', fullName: '서울특별시 송파구 잠실동', sigunguName: '송파구' };
const building = (overrides = {}) => ({
  complexId: 'complex-1',
  name: '잠실한빛아파트',
  legalDongCode: REGION.legalDongCode,
  regionName: REGION.fullName,
  unitCount: 3,
  unitAreas: [84.97],
  memberCount: 3,
  verificationStatus: 'VERIFIED',
  verifyPropertyId: null,
  ...overrides,
});
const SECOND = building({ complexId: 'complex-2', name: '해운대서강아파트', legalDongCode: '2635010500', regionName: '부산광역시 해운대구 우동', unitCount: 1 });

const page = (items, meta = {}) => ({
  data: items,
  meta: { page: 1, size: 20, total: items.length, hasNext: false, region: REGION, canWrite: true, writeBlockedReason: null, ...meta },
});
const post = (i, overrides = {}) => ({
  id: `post-${i}`,
  category: 'FREE',
  title: `게시글 ${i}`,
  authorNickname: '서강',
  authorLabel: '잠실서강아파트 201동 임대인',
  commentCount: i,
  isMine: false,
  createdAt: '2026-11-04T01:00:00.000Z',
  ...overrides,
});
const POST_DETAIL = {
  ...post(1),
  body: '관리사무소에서 공동현관 도어락을 바꾼다고 합니다.',
  legalDongCode: REGION.legalDongCode,
  canWrite: true,
  writeBlockedReason: null,
  locked: false,
  comments: [],
  commentCount: 0,
};
const OPTIONS = [
  { id: 'opt-1', label: '지금 위치 유지', position: 1 },
  { id: 'opt-2', label: '정문 쪽으로 이동', position: 2 },
];
const pollDetail = (overrides = {}) => ({
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
const MARKET_COLLECTING = {
  scope: 'COMPLEX', complexId: 'complex-1', legalDongCode: REGION.legalDongCode, dealType: 'SALE', areaMin: 60, areaMax: 85,
  coveredFromYearMonth: null, asOf: null, source: '국토교통부 실거래가', collectionStatus: 'COLLECTING', jobId: 'job-1', monthly: [], recentDeals: [],
};

const LocationProbe = () => <output data-testid="location">{useLocation().pathname}</output>;
const where = () => screen.getByTestId('location').textContent;

const renderAt = (entries) =>
  render(
    <MemoryRouter initialEntries={Array.isArray(entries) ? entries : [entries]} initialIndex={Array.isArray(entries) ? entries.length - 1 : 0}>
      <Routes>
        <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} onUnauthorized={vi.fn()} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );

// 파일의 첫 렌더는 화면 코드를 처음 불러와 전체 실행 때 1초를 넘기기도 한다 — 첫 대기만 여유를 둔다
const FIRST_RENDER = { timeout: 3000 };
const chips = () => screen.getByRole('navigation', { name: '커뮤니티 메뉴' });
const backBarTitle = () => within(screen.getByRole('banner')).getByRole('heading', { level: 1 });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, '');
  api.getMyBuildings.mockResolvedValue([building()]);
  api.getCommunityProfile.mockResolvedValue({ nickname: '석촌호수뷰', nextChangeAt: null, previewLabel: '잠실한빛아파트 103동 임대인' });
  api.getCommunityPostList.mockResolvedValue(page([1, 2, 3].map((i) => post(i))));
  api.getCommunityPost.mockResolvedValue(POST_DETAIL);
  api.getCommunityPollList.mockResolvedValue(page([]));
  api.getCommunityPoll.mockResolvedValue(pollDetail());
  api.getCommunityNewsList.mockResolvedValue(page([]));
  api.getCommunityComplexNewsList.mockResolvedValue(page([]));
  api.getComplexMarketPrices.mockResolvedValue(MARKET_COLLECTING);
  api.getNotificationUnreadCount.mockResolvedValue({ count: 0 });
});

describe('앱 커뮤니티: 들어오기 · 머리 · 칩 줄', () => {
  it('하단 탭 [커뮤니티] → /community → 브리핑. 앱 셸 안에서 홈형 상단 바 · 앱 머리 · 칩 줄, "준비 중" · PC 머리 · 탭 줄은 없다', async () => {
    const { container } = renderAt('/landlord/home');
    await userEvent.click(within(screen.getByRole('navigation', { name: '하단 메뉴' })).getByRole('button', { name: '커뮤니티' }));
    expect(await screen.findByRole('heading', { level: 1, name: /잠실한빛아파트/ }, FIRST_RENDER)).toBeInTheDocument();
    expect(where()).toBe('/landlord/community/briefing');
    expect(container.querySelector('[data-shell="landlord-app"]')).not.toBeNull();
    // 홈형 상단 바(검색 · 알림 · 내 계정) — 뒤로 가기 없음, 왼쪽 로고 · Butler 자리에 단지 이름
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('button', { name: '내 계정' })).toBeInTheDocument();
    expect(within(banner).queryByRole('button', { name: '뒤로 가기' })).not.toBeInTheDocument();
    expect(within(banner).getByRole('heading', { level: 1 })).toHaveTextContent('잠실한빛아파트');
    expect(within(banner).queryByText('Butler')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '준비 중' })).not.toBeInTheDocument();
    // PC 머리와 같은 정보: 지역 · 닉네임 · 인증 배지. 건물이 하나면 ▾(건물 바꾸기) 없음 — PC 도 그때는 [건물 바꾸기]가 없다
    expect(screen.getByText('서울특별시 송파구 잠실동')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '닉네임 · 석촌호수뷰' })).toBeInTheDocument();
    expect(screen.getByText('인증 완료')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /건물 바꾸기/ })).not.toBeInTheDocument();
    // 브리핑 칸은 PC 와 같은 순서 · 같은 제목
    const sections = await screen.findAllByRole('region');
    expect(sections.map((section) => section.getAttribute('aria-label'))).toEqual(['시세', '최근 거래', '최근 게시글', '최근 뉴스', '최근 투표']);
    // 하단 탭은 커뮤니티가 켜짐
    expect(within(screen.getByRole('navigation', { name: '하단 메뉴' })).getByRole('button', { name: '커뮤니티' })).toHaveAttribute('aria-current', 'page');
  });

  it('칩 줄은 PC 탭 줄과 같은 목록 · 순서 · 주소. 누르면 그 화면으로 가고 칩이 따라 켜진다', async () => {
    renderAt('/landlord/community/briefing');
    await screen.findByRole('heading', { level: 1, name: /잠실한빛아파트/ }, FIRST_RENDER);
    const buttons = within(chips()).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['브리핑', '뉴스', '시세', '게시판', '투표']);
    expect(buttons[0]).toHaveAttribute('aria-current', 'page');
    for (const [label, path] of [
      ['뉴스', '/landlord/community/news'],
      ['시세', '/landlord/community/market'],
      ['게시판', '/landlord/community/board'],
      ['투표', '/landlord/community/polls'],
      ['브리핑', '/landlord/community/briefing'],
    ]) {
      await userEvent.click(within(chips()).getByRole('button', { name: label }));
      expect(where()).toBe(path);
      expect(within(chips()).getByRole('button', { name: label })).toHaveAttribute('aria-current', 'page');
    }
  });

  it('건물이 둘이면 단지 이름 ▾ → 아래 시트 "건물 바꾸기"(PC 드롭다운과 같은 줄) → 고르면 그 건물로', async () => {
    api.getMyBuildings.mockResolvedValue([building(), SECOND]);
    renderAt('/landlord/community/briefing');
    await userEvent.click(await screen.findByRole('button', { name: /잠실한빛아파트.*건물 바꾸기/ }, FIRST_RENDER));
    const sheet = screen.getByRole('dialog', { name: '건물 바꾸기' });
    expect(sheet).toHaveClass('rounded-t-card'); // 가운데 대화상자가 아니라 아래 시트
    const rows = within(sheet).getAllByRole('radio');
    expect(rows.map((row) => row.textContent)).toEqual([
      '잠실한빛아파트3호실 보유 · 서울특별시 송파구 잠실동 · 임대인 3명',
      '해운대서강아파트1호실 보유 · 부산광역시 해운대구 우동 · 임대인 3명',
    ]);
    expect(rows[0]).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(rows[1]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: /해운대서강아파트/ })).toBeInTheDocument();
  });
});

describe('앱 커뮤니티: 하위 화면 · 뒤로 가기', () => {
  it.each([
    ['/landlord/community/posts/post-1', '게시판', '/landlord/community/board'],
    ['/landlord/community/posts/new', '게시판', '/landlord/community/board'],
    ['/landlord/community/posts/post-1/edit', '게시판', '/landlord/community/posts/post-1'],
    ['/landlord/community/polls/poll-1', '투표', '/landlord/community/polls'],
    ['/landlord/community/polls/new', '투표', '/landlord/community/polls'],
  ])('%s 은 뒤로 가기 바(제목 %s) · 머리 · 칩 줄 · "목록으로" 없음, 주소로 바로 들어왔으면 뒤로 → %s', async (path, title, fallback) => {
    renderAt(path);
    await waitFor(() => expect(backBarTitle()).toHaveTextContent(title), FIRST_RENDER);
    await screen.findByRole('main');
    expect(screen.queryByRole('navigation', { name: '커뮤니티 메뉴' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '목록으로' })).not.toBeInTheDocument();
    // 하단 탭은 그대로(커뮤니티 켜짐)
    expect(within(screen.getByRole('navigation', { name: '하단 메뉴' })).getByRole('button', { name: '커뮤니티' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: '뒤로 가기' }));
    expect(where()).toBe(fallback);
  });

  it('목록에서 들어온 글 상세는 뒤로 가기가 그 목록으로(앱 안 이동 기록)', async () => {
    renderAt('/landlord/community/board');
    await userEvent.click(await screen.findByRole('button', { name: /게시글 2/ }, FIRST_RENDER));
    await waitFor(() => expect(backBarTitle()).toHaveTextContent('게시판'));
    expect(where()).toBe('/landlord/community/posts/post-2');
    await userEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: '뒤로 가기' }));
    expect(where()).toBe('/landlord/community/board');
  });
});

describe('앱 커뮤니티: PC 와 같은 상태 · 규칙', () => {
  it('인증 전(미리보기) — PC 와 같은 안내 한 줄 + [권리자 인증하기](앱의 권리자 인증 화면으로), 배지 "인증 전"', async () => {
    api.getMyBuildings.mockResolvedValue([building({ verificationStatus: 'UNVERIFIED', verifyPropertyId: 'property-9' })]);
    renderAt('/landlord/community/briefing');
    expect(await screen.findByText('권리자 인증을 마치면 글을 읽고 투표에 참여할 수 있어요', {}, FIRST_RENDER)).toBeInTheDocument();
    expect(screen.getByText('인증 전')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '권리자 인증하기' }));
    expect(where()).toBe('/landlord/properties/property-9/verify');
  });

  it('마감 전 · 참여 전 투표: 선택지와 [투표하기]만 — 득표(표 · %)는 없다', async () => {
    renderAt('/landlord/community/polls/poll-1');
    expect(await screen.findByRole('button', { name: '투표하기' }, FIRST_RENDER)).toBeInTheDocument();
    expect(screen.getByText(/인증한 호실/)).toHaveTextContent('인증한 호실 3개 — 3표로 반영됩니다.');
    expect(screen.queryByRole('list', { name: '투표 결과' })).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('마감 전 · 참여함: "참여함 · 3표"로 잠기고 내 선택만 — 득표는 여전히 없다', async () => {
    api.getCommunityPoll.mockResolvedValue(pollDetail({ hasVoted: true, myOptionId: 'opt-2', canVote: false, voteCount: 2 }));
    renderAt('/landlord/community/polls/poll-1');
    const button = await screen.findByRole('button', { name: '참여함 · 3표' }, FIRST_RENDER);
    expect(button).toBeDisabled();
    expect(screen.getByRole('radio', { name: '정문 쪽으로 이동' })).toBeChecked();
    expect(screen.queryByRole('list', { name: '투표 결과' })).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('마감 뒤: PC 와 같은 결과(참여 n명 · 총 m표, 선택지마다 표 · %) + "마감된 투표입니다"', async () => {
    api.getCommunityPoll.mockResolvedValue(
      pollDetail({
        isClosed: true,
        canVote: false,
        hasVoted: true,
        myOptionId: 'opt-1',
        voteCount: 2,
        weightTotal: 5,
        options: [
          { ...OPTIONS[0], voteCount: 1, weightTotal: 3, percent: 60 },
          { ...OPTIONS[1], voteCount: 1, weightTotal: 2, percent: 40 },
        ],
      }),
    );
    renderAt('/landlord/community/polls/poll-1');
    const results = await screen.findByRole('list', { name: '투표 결과' }, FIRST_RENDER);
    expect(within(results).getByText('지금 위치 유지').closest('li')).toHaveTextContent('3표 · 60%');
    expect(screen.getByText('마감된 투표입니다')).toBeInTheDocument();
  });

  it('게시판: 표가 아니라 같은 칸(분류 · 제목 · [댓글 수] · 작성자 · 작성일)의 목록, [글쓰기]는 하단 탭 위에 떠 있는 버튼', async () => {
    renderAt('/landlord/community/board');
    const list = await screen.findByRole('list', { name: '게시글' }, FIRST_RENDER);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const first = within(list).getAllByRole('button')[0];
    expect(first).toHaveTextContent('자유');
    expect(first).toHaveTextContent('게시글 1');
    expect(within(first).getByLabelText('댓글 1개')).toHaveTextContent('[1]');
    expect(first).toHaveTextContent('서강 (잠실서강아파트 201동 임대인)');
    expect(first).toHaveTextContent('11-04');
    const write = screen.getByRole('button', { name: '글쓰기' });
    expect(write.parentElement).toHaveClass('fixed');
    await userEvent.click(write);
    expect(where()).toBe('/landlord/community/posts/new');
    await waitFor(() => expect(backBarTitle()).toHaveTextContent('게시판'));
  });

  it('투표 목록의 [투표 만들기]도 떠 있고, 쓸 수 없으면(인증 전) PC 와 같이 막힌다', async () => {
    api.getCommunityPollList.mockResolvedValue(page([], { canWrite: false, writeBlockedReason: 'UNVERIFIED' }));
    renderAt('/landlord/community/polls');
    const create = await screen.findByRole('button', { name: '투표 만들기' }, FIRST_RENDER);
    await waitFor(() => expect(create).toBeDisabled());
    expect(create.parentElement).toHaveClass('fixed');
    expect(screen.getByText('진행 중인 투표가 없습니다.')).toBeInTheDocument();
  });

  it('빈 상태는 큰 상자가 아니라 카드 안 한 줄(문구는 PC 와 같다)', async () => {
    api.getCommunityPostList.mockResolvedValue(page([]));
    renderAt('/landlord/community/briefing');
    const posts = await screen.findByRole('region', { name: '최근 게시글' }, FIRST_RENDER);
    const note = await within(posts).findByText('아직 올라온 글이 없습니다');
    expect(note).toHaveAttribute('role', 'status');
    expect(note).toHaveClass('py-3.5');
  });
});

describe('앱 커뮤니티: 시세 "모으는 중" 안내는 PC 와 같은 세 상태 — 일부 모음 · 하나도 못 모음 + 실패 · 시도 전 (#267)', () => {
  const progress = (values) => ({
    requiredMonths: 13, collectedMonths: 0, failedMonths: 0, notTriedMonths: 13, lastAttemptedAt: null, lastFailedAt: null, lastErrorCode: null, ...values,
  });
  const collecting = (values) => ({ ...MARKET_COLLECTING, collectionProgress: progress(values) });
  // 11/27 배포 노원구 모양 — 8개월 모음 · 5개월은 키 교체 전 실패(30)
  const PARTIAL = collecting({
    collectedMonths: 8, failedMonths: 5, notTriedMonths: 0, lastAttemptedAt: '2026-11-26T17:32:00.000Z', lastFailedAt: '2026-11-24T17:32:00.000Z', lastErrorCode: '30',
  });
  // UTC 11/24 17:00 = 한국 11/25 02:00
  const FAILED = collecting({ failedMonths: 13, notTriedMonths: 0, lastAttemptedAt: '2026-11-24T17:00:05.000Z', lastFailedAt: '2026-11-24T17:00:05.000Z', lastErrorCode: '30' });
  const NOT_TRIED = collecting({});
  const noteOf = async (title, scope = document.body) => (await within(scope).findByText(title, {}, FIRST_RENDER)).closest('p');
  const marketSection = () => screen.findByRole('region', { name: '시세' }, FIRST_RENDER);

  // 일부 모음 · 실패의 설명 줄은 덩어리 둘(DotLine — 사이 점은 CSS ::before 라 글에는 없다)
  const expectPartial = (note) => {
    expect(note).toHaveAttribute('role', 'status');
    expect(note).toHaveTextContent('시세를 모으는 중이에요최근 13개월 중 8개월을 모았어요매일 새벽 이어서 모아요');
    expect(within(note).getByText('시세를 모으는 중이에요')).toHaveClass('block', 'font-semibold');
    expect(within(note).getByText('매일 새벽 이어서 모아요')).toHaveClass('whitespace-nowrap');
    expect(within(note).getByText('13')).toHaveClass('font-num', 'tabular-nums');
    expect(within(note).getByText('8')).toHaveClass('font-num', 'tabular-nums');
    expect(note.textContent).not.toMatch(/불러오지 못했어요|마지막 시도|하루 안에|30/);
  };
  const expectFailed = (note) => {
    expect(note).toHaveTextContent('시세를 아직 불러오지 못했어요매일 새벽 다시 시도하고 있어요마지막 시도 2026-11-25');
    expect(within(note).getByText('2026-11-25')).toHaveClass('font-num', 'tabular-nums');
    expect(within(note).getByText('2026-11-25').parentElement).toHaveClass('whitespace-nowrap');
    expect(note.textContent).not.toMatch(/개월을 모았어요|하루 안에|30/);
  };

  it('시세 탭 · 일부 모음: "시세를 모으는 중이에요" + 최근 13개월 중 8개월을 모았어요 · 매일 새벽 이어서 모아요(실패한 달이 있어도)', async () => {
    api.getComplexMarketPrices.mockResolvedValue(PARTIAL);
    renderAt('/landlord/community/market');
    expectPartial(await noteOf('시세를 모으는 중이에요'));
    // 시세 탭은 모으는 중이면 최근 거래 목록 자체를 그리지 않는다(빈 상태 문구도 없음)
    expect(screen.queryByRole('list', { name: '최근 거래' })).not.toBeInTheDocument();
    expect(screen.queryByText(/거래가 없습니다/)).not.toBeInTheDocument();
  });

  it('시세 탭 · 하나도 못 모음 + 실패: "시세를 아직 불러오지 못했어요" + 매일 새벽 다시 시도 · 마지막 시도 한국 날짜', async () => {
    api.getComplexMarketPrices.mockResolvedValue(FAILED);
    renderAt('/landlord/community/market');
    expectFailed(await noteOf('시세를 아직 불러오지 못했어요'));
  });

  it('시세 탭 · 아직 시도 전: 11/17 문구 그대로("하루 안에 채워집니다")', async () => {
    api.getComplexMarketPrices.mockResolvedValue(NOT_TRIED);
    renderAt('/landlord/community/market');
    const note = await noteOf('이 단지의 실거래를 모으는 중이에요');
    expect(note).toHaveTextContent('이 단지의 실거래를 모으는 중이에요하루 안에 채워집니다. 그때 다시 열어 주세요.');
    expect(note.textContent).not.toMatch(/개월을 모았어요|불러오지 못했어요|마지막 시도/);
  });

  it('브리핑 시세 카드 · 일부 모음: 두 줄(제목 · 모은 개월 수)', async () => {
    api.getComplexMarketPrices.mockResolvedValue(PARTIAL);
    renderAt('/landlord/community/briefing');
    expectPartial(await noteOf('시세를 모으는 중이에요', await marketSection()));
  });

  it('브리핑 시세 카드 · 하나도 못 모음 + 실패: 두 줄(제목 · 다시 시도 · 마지막 시도)', async () => {
    api.getComplexMarketPrices.mockResolvedValue(FAILED);
    renderAt('/landlord/community/briefing');
    expectFailed(await noteOf('시세를 아직 불러오지 못했어요', await marketSection()));
  });

  it('브리핑 시세 카드 · 아직 시도 전: 한 줄 그대로', async () => {
    api.getComplexMarketPrices.mockResolvedValue(NOT_TRIED);
    renderAt('/landlord/community/briefing');
    const market = await marketSection();
    const note = await noteOf('실거래를 모으는 중이에요. 하루 안에 채워집니다', market);
    expect(note).toHaveAttribute('role', 'status');
    expect(market.textContent).not.toMatch(/개월을 모았어요|불러오지 못했어요|마지막 시도/);
  });

  // 서버는 COLLECTING 이면 recentDeals 를 비워 준다 — 거래가 없는 게 아니라 아직 안 보여 주는 것(PC 와 같다)
  const dealsSection = () => screen.findByRole('region', { name: '최근 거래' }, FIRST_RENDER);
  it.each([
    ['일부 모음', PARTIAL, '시세를 모으는 중이에요', expectPartial],
    ['하나도 못 모음 + 실패', FAILED, '시세를 아직 불러오지 못했어요', expectFailed],
    ['아직 시도 전', NOT_TRIED, '실거래를 모으는 중이에요. 하루 안에 채워집니다', (note) => expect(note).toHaveAttribute('role', 'status')],
  ])('브리핑 최근 거래 카드 · 모으는 중(%s)이면 시세 카드와 같은 안내 — "최근 거래가 없습니다" 없음', async (_, prices, title, expectNote) => {
    api.getComplexMarketPrices.mockResolvedValue(prices);
    renderAt('/landlord/community/briefing');
    const deals = await dealsSection();
    const note = await noteOf(title, deals);
    expectNote(note);
    expect(within(deals).queryByText('최근 거래가 없습니다')).not.toBeInTheDocument();
    expect((await noteOf(title, await marketSection())).textContent).toBe(note.textContent);
  });

  it('브리핑 최근 거래 카드 · 다 모았는데(READY) 그 면적대 거래가 0건이면 "최근 거래가 없습니다"', async () => {
    api.getComplexMarketPrices.mockResolvedValue({ ...MARKET_COLLECTING, collectionStatus: 'READY', jobId: null, asOf: '2026-11-17', coveredFromYearMonth: '2025-11' });
    renderAt('/landlord/community/briefing');
    const deals = await dealsSection();
    expect(await within(deals).findByText('최근 거래가 없습니다', {}, FIRST_RENDER)).toHaveAttribute('role', 'status');
    expect(deals.textContent).not.toMatch(/모으는 중|불러오지 못했어요/);
  });
});

describe('앱 커뮤니티: 좁은 폭에서도 목록 제목이 보인다', () => {
  const LONG_TITLE = '공동현관 도어락 교체 비용을 세대별로 똑같이 나눌지 평형별로 나눌지 관리단 회의 전에 다른 단지 사례를 여쭙니다';
  // 제목 줄: 줄의 맨 위에 혼자(옆에 폭을 다투는 칩 · 날짜가 없다) · 한 줄 말줄임(truncate)이 아니라 최대 2줄 · 글자는 다 들어 있다
  const expectTitleOnTop = (title) => {
    expect(title).toHaveClass('line-clamp-2');
    expect(title).not.toHaveClass('truncate');
    expect(title.parentElement.firstElementChild).toBe(title);
    expect(title.parentElement).toHaveClass('flex-col');
  };

  it.each([
    ['/landlord/community/briefing', '최근 게시글'],
    ['/landlord/community/board', '게시글'],
  ])('%s 의 글 줄(%s)', async (path, label) => {
    api.getCommunityPostList.mockResolvedValue(page([post(1, { title: LONG_TITLE }), post(2)]));
    renderAt(path);
    const list = await screen.findByRole('list', { name: label }, FIRST_RENDER);
    const titles = list.querySelectorAll('[data-row-title]');
    expect(titles).toHaveLength(2);
    expect(titles[0]).toHaveTextContent(LONG_TITLE);
    titles.forEach(expectTitleOnTop);
  });

  it('뉴스 · 투표 줄도 제목이 맨 위(뉴스는 원문 링크 표시가 오른쪽 끝)', async () => {
    api.getCommunityNewsList.mockResolvedValue(
      page([{ id: 'n-1', scope: 'SIGUNGU', title: LONG_TITLE, url: 'https://news.example/1', publisher: '한국부동산경제매거진 정책연구소', publishedAt: '2026-11-04T01:00:00.000Z' }]),
    );
    api.getCommunityPollList.mockResolvedValue(page([{ id: 'poll-9', scope: 'REGION', complexId: null, title: LONG_TITLE, closesAt: '2099-01-01T00:00:00.000Z', isClosed: false, voteCount: 3, hasVoted: false }]));
    renderAt('/landlord/community/briefing');
    const news = await screen.findByRole('list', { name: '최근 뉴스' }, FIRST_RENDER);
    const newsTitle = news.querySelector('[data-row-title]');
    expect(newsTitle).toHaveTextContent(LONG_TITLE);
    expectTitleOnTop(newsTitle);
    expect(within(news).getByRole('link')).toHaveTextContent('한국부동산경제매거진 정책연구소');
    const polls = await screen.findByRole('list', { name: '최근 투표' });
    expectTitleOnTop(polls.querySelector('[data-row-title]'));
  });

  it('앱 커뮤니티 화면에는 창 폭에 따라 바뀌는 클래스(sm: · md: · lg: · xl:)가 없다 — 넓은 창에서 ?surface=app 으로 봐도 한 줄 배치', async () => {
    for (const path of ['/landlord/community/briefing', '/landlord/community/board', '/landlord/community/polls', '/landlord/community/news', '/landlord/community/market']) {
      const { container, unmount } = renderAt(path);
      await screen.findByRole('navigation', { name: '커뮤니티 메뉴' }, FIRST_RENDER);
      const main = container.querySelector('main');
      const responsive = [...main.querySelectorAll('[class]')].filter((el) => /(^|\s)(sm|md|lg|xl):/.test(el.getAttribute('class')));
      expect(responsive.map((el) => el.getAttribute('class')), path).toEqual([]);
      unmount();
    }
  });
});

describe('앱 커뮤니티: 뉴스는 PC 와 같은 구성 — "우리 단지" 카드 없이 "우리 지역" 맨 위에 단지 기사 최대 3건', () => {
  const SIDO_REGION = { ...REGION, sidoLabel: '서울' };
  const article = (key, scope, url = `https://news.example/${key}`) => ({
    id: key, scope, title: `${key} 기사`, url, publisher: '한빛일보', publishedAt: '2026-11-04T01:00:00.000Z',
  });
  const regionPage = (items, meta = {}) => page(items, { region: SIDO_REGION, sidoFallback: false, ...meta });
  // 지역 기사: 송파 5건(다음 페이지 없음), 전국 1건. 시·도는 부르면 서울 3건
  const mockRegionNews = ({ sigungu = [1, 2, 3, 4, 5].map((i) => article(`송파${i}`, 'SIGUNGU')), sigunguMeta = {} } = {}) =>
    api.getCommunityNewsList.mockImplementation(async ({ scope }) => {
      if (scope === 'NATIONWIDE') return regionPage([article('전국1', 'NATIONWIDE')]);
      if (scope === 'SIDO') return regionPage([1, 2, 3].map((i) => article(`서울${i}`, 'SIDO')));
      return regionPage(sigungu, sigunguMeta);
    });
  const titles = (list) => [...list.querySelectorAll('[data-row-title]')].map((title) => title.textContent);
  const expectOnlyTwoCards = () => {
    const cards = screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'));
    expect(cards).toEqual(['우리 지역', '전국 정책']);
    expect(screen.queryByText('단지 이름이 제목에 들어간 기사')).not.toBeInTheDocument();
    expect(screen.queryByText('아직 이 단지 이름이 들어간 기사가 없습니다')).not.toBeInTheDocument();
  };

  it('단지 기사 5건 → 우리 지역 맨 위에 최신 3건, 칩 "우리 단지"는 제목이 아니라 날짜 줄 앞(앱 브리핑과 같다), 그 아래 구 기사', async () => {
    mockRegionNews();
    api.getCommunityComplexNewsList.mockResolvedValue(page([1, 2, 3, 4, 5].map((i) => article(`단지${i}`, 'COMPLEX')), { size: 3, total: 5, hasNext: true }));
    renderAt('/landlord/community/news');
    const list = await screen.findByRole('list', { name: '송파구 기사' }, FIRST_RENDER);
    expect(titles(list)).toEqual(['단지1 기사', '단지2 기사', '단지3 기사', '송파1 기사', '송파2 기사', '송파3 기사', '송파4 기사', '송파5 기사']);
    const chips = within(list).getAllByText('우리 단지');
    expect(chips).toHaveLength(3);
    for (const chip of chips) {
      const row = chip.closest('a');
      const title = row.querySelector('[data-row-title]');
      expect(title).not.toContainElement(chip);
      // 제목 바로 아래 줄(날짜 줄)의 맨 앞
      expect(title.nextElementSibling.firstElementChild).toBe(chip);
    }
    expect(api.getCommunityComplexNewsList).toHaveBeenCalledWith(expect.objectContaining({ complexId: 'complex-1', page: 1, size: 3 }));
    // 단지 기사의 다음 페이지는 부르지 않는다 — 카드의 더 보기는 구 기사 것뿐(이 구는 다음 페이지 없음)
    expect(within(screen.getByRole('region', { name: '우리 지역' })).queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
    expectOnlyTwoCards();
    expect(screen.getByRole('list', { name: '전국 정책 기사' })).toBeInTheDocument();
  });

  it('단지 기사와 구 기사에 같은 주소 → 단지 쪽으로 한 번만', async () => {
    mockRegionNews();
    api.getCommunityComplexNewsList.mockResolvedValue(page([article('단지1', 'COMPLEX', 'https://news.example/송파1'), article('단지2', 'COMPLEX')]));
    renderAt('/landlord/community/news');
    const list = await screen.findByRole('list', { name: '송파구 기사' }, FIRST_RENDER);
    expect(titles(list)).toEqual(['단지1 기사', '단지2 기사', '송파2 기사', '송파3 기사', '송파4 기사', '송파5 기사']);
    expect(within(list).getAllByRole('link').filter((link) => link.getAttribute('href') === 'https://news.example/송파1')).toHaveLength(1);
  });

  it('단지 기사 0건 → 구 기사만, 칩 · 빈 안내 없음', async () => {
    mockRegionNews();
    api.getCommunityComplexNewsList.mockResolvedValue(page([]));
    renderAt('/landlord/community/news');
    const list = await screen.findByRole('list', { name: '송파구 기사' }, FIRST_RENDER);
    expect(titles(list)).toEqual(['송파1 기사', '송파2 기사', '송파3 기사', '송파4 기사', '송파5 기사']);
    expect(within(list).queryByText('우리 단지')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '우리 지역' })).queryByText(/기사가 없습니다/)).not.toBeInTheDocument();
    expectOnlyTwoCards();
  });

  it('단지 기사를 못 불러와도 구 기사는 그대로', async () => {
    mockRegionNews();
    api.getCommunityComplexNewsList.mockRejectedValue(new Error('boom'));
    renderAt('/landlord/community/news');
    const list = await screen.findByRole('list', { name: '송파구 기사' }, FIRST_RENDER);
    expect(titles(list)).toHaveLength(5);
    expect(within(list).queryByText('우리 단지')).not.toBeInTheDocument();
  });

  it('시 · 도 채움은 지금처럼 — 구 기사가 모자라면(sidoFallback) 아래 "서울 전체" 묶음, 단지 기사와 같은 주소는 뺀다', async () => {
    mockRegionNews({ sigungu: [article('송파1', 'SIGUNGU'), article('송파2', 'SIGUNGU')], sigunguMeta: { sidoFallback: true } });
    api.getCommunityComplexNewsList.mockResolvedValue(page([article('단지1', 'COMPLEX'), article('단지2', 'COMPLEX', 'https://news.example/서울1')]));
    renderAt('/landlord/community/news');
    const list = await screen.findByRole('list', { name: '송파구 기사' }, FIRST_RENDER);
    expect(titles(list)).toEqual(['단지1 기사', '단지2 기사', '송파1 기사', '송파2 기사']);
    expect(await screen.findByRole('heading', { name: '서울 전체' })).toBeInTheDocument();
    const sidoList = screen.getByRole('list', { name: '서울 전체 기사' });
    expect(titles(sidoList)).toEqual(['서울2 기사', '서울3 기사']);
    expect(within(sidoList).queryByText('우리 단지')).not.toBeInTheDocument();
    expect(api.getCommunityNewsList).toHaveBeenCalledWith(expect.objectContaining({ scope: 'SIDO', page: 1, size: 10 }));
  });

  it('구 기사가 넉넉하면(sidoFallback 아님) 시 · 도는 부르지 않는다', async () => {
    mockRegionNews();
    api.getCommunityComplexNewsList.mockResolvedValue(page([article('단지1', 'COMPLEX')]));
    renderAt('/landlord/community/news');
    await screen.findByRole('list', { name: '송파구 기사' }, FIRST_RENDER);
    expect(screen.queryByRole('heading', { name: '서울 전체' })).not.toBeInTheDocument();
    expect(api.getCommunityNewsList).not.toHaveBeenCalledWith(expect.objectContaining({ scope: 'SIDO' }));
  });
});

describe('앱 커뮤니티: 신고 · 닉네임은 아래 시트(문구는 PC 대화상자와 같다)', () => {
  it('글 상세 [신고] → 시트 "신고": 사유 · 상세 내용 (선택) · [취소] · [신고하기]', async () => {
    renderAt('/landlord/community/posts/post-1');
    await userEvent.click(await screen.findByRole('button', { name: '신고' }, FIRST_RENDER));
    const sheet = screen.getByRole('dialog', { name: '신고' });
    expect(sheet).toHaveClass('rounded-t-card');
    expect(within(sheet).getByText('사유')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('상세 내용 (선택)')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: '취소' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: '신고하기' })).toBeDisabled();
    await userEvent.click(within(sheet).getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('머리 "닉네임 · …" → 시트 "커뮤니티 닉네임"(PC 대화상자와 같은 안내 · 규칙 문구)', async () => {
    renderAt('/landlord/community/briefing');
    await userEvent.click(await screen.findByRole('button', { name: '닉네임 · 석촌호수뷰' }, FIRST_RENDER));
    const sheet = screen.getByRole('dialog', { name: '커뮤니티 닉네임' });
    expect(sheet).toHaveClass('rounded-t-card');
    expect(sheet).toHaveTextContent("글과 댓글에 '닉네임 (단지명 동 임대인)' 으로 보입니다");
    expect(sheet).toHaveTextContent('2~12자 · 한글 · 영문 · 숫자 · 30일에 한 번 바꿀 수 있어요');
    expect(within(sheet).getByRole('button', { name: '저장' })).toBeInTheDocument();
  });
});

describe('앱 커뮤니티: 시트는 다른 앱 시트처럼 내려간 뒤 닫힌다(BottomSheet useBottomSheet)', () => {
  // AppBottomSheet.test.jsx 와 같은 방식 — element.animate 를 흉내 내고, 끝내기 전 · 뒤를 본다
  let finishers;
  let animateSpy;
  const originalAnimate = Element.prototype.animate;
  const originalMatchMedia = window.matchMedia;
  const transforms = () => animateSpy.mock.calls.filter(([keyframes]) => 'transform' in keyframes[0]).map(([keyframes]) => keyframes);
  const SLIDE_UP = [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }];
  const SLIDE_DOWN = [{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }];
  const finishAll = async () => {
    await act(async () => {
      finishers.forEach((resolve) => resolve());
    });
  };
  // 내려가는 중: 시트는 아직 있고 마지막 움직임이 내려가기. 끝나면 사라진다
  const expectSlidesDownThenCloses = async (name) => {
    await waitFor(() => expect(transforms().at(-1)).toEqual(SLIDE_DOWN));
    expect(screen.getByRole('dialog', { name })).toBeInTheDocument();
    await finishAll();
    expect(screen.queryByRole('dialog', { name })).not.toBeInTheDocument();
  };

  beforeEach(() => {
    finishers = [];
    animateSpy = vi.fn(() => {
      let resolve;
      const finished = new Promise((done) => {
        resolve = done;
      });
      finishers.push(resolve);
      return { finished, cancel: vi.fn() };
    });
    Element.prototype.animate = animateSpy;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  afterEach(() => {
    Element.prototype.animate = originalAnimate;
    window.matchMedia = originalMatchMedia;
  });

  const openReport = async () => {
    await userEvent.click(await screen.findByRole('button', { name: '신고' }, FIRST_RENDER));
    return screen.getByRole('dialog', { name: '신고' });
  };

  it('신고: 열리면 올라오고, [취소] · X · Esc 는 내려간 뒤 닫힌다', async () => {
    renderAt('/landlord/community/posts/post-1');
    let sheet = await openReport();
    expect(transforms()).toEqual([SLIDE_UP]);
    await userEvent.click(within(sheet).getByRole('button', { name: '취소' }));
    await expectSlidesDownThenCloses('신고');

    sheet = await openReport();
    await userEvent.click(within(sheet).getByRole('button', { name: '닫기' }));
    await expectSlidesDownThenCloses('신고');

    await openReport();
    await userEvent.keyboard('{Escape}');
    await expectSlidesDownThenCloses('신고');
  });

  it('신고: [신고하기] 성공 뒤 내려가고, 다 내려간 다음에 "신고가 접수되었습니다"', async () => {
    api.postCommunityReport.mockResolvedValue({ id: 'report-1' });
    renderAt('/landlord/community/posts/post-1');
    const sheet = await openReport();
    await userEvent.click(within(sheet).getByRole('radio', { name: '도배·스팸' }));
    await userEvent.click(within(sheet).getByRole('button', { name: '신고하기' }));
    expect(api.postCommunityReport).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(transforms().at(-1)).toEqual(SLIDE_DOWN));
    expect(screen.queryByText('신고가 접수되었습니다.')).not.toBeInTheDocument();
    await finishAll();
    expect(screen.queryByRole('dialog', { name: '신고' })).not.toBeInTheDocument();
    expect(screen.getByText('신고가 접수되었습니다.')).toBeInTheDocument();
  });

  it('신고: 바깥을 누르면 내려간 뒤 닫히고, 보내는 중에는 바깥을 눌러도 닫히지 않는다', async () => {
    renderAt('/landlord/community/posts/post-1');
    let sheet = await openReport();
    await userEvent.click(sheet.parentElement);
    await expectSlidesDownThenCloses('신고');

    api.postCommunityReport.mockReturnValue(new Promise(() => {}));
    sheet = await openReport();
    await userEvent.click(within(sheet).getByRole('radio', { name: '도배·스팸' }));
    await userEvent.click(within(sheet).getByRole('button', { name: '신고하기' }));
    await waitFor(() => expect(within(sheet).getByRole('button', { name: '신고하기' })).toBeDisabled());
    const before = transforms().length;
    await userEvent.click(sheet.parentElement);
    expect(transforms()).toHaveLength(before);
    expect(screen.getByRole('dialog', { name: '신고' })).toBeInTheDocument();
  });

  it('닉네임: [저장] 성공 뒤 내려간 다음 닫힌다', async () => {
    api.putCommunityProfile.mockResolvedValue({ nickname: '호수뷰', nextChangeAt: null, previewLabel: '잠실한빛아파트 103동 임대인' });
    renderAt('/landlord/community/briefing');
    await userEvent.click(await screen.findByRole('button', { name: '닉네임 · 석촌호수뷰' }, FIRST_RENDER));
    const sheet = screen.getByRole('dialog', { name: '커뮤니티 닉네임' });
    const input = within(sheet).getByLabelText('닉네임');
    await userEvent.clear(input);
    await userEvent.type(input, '호수뷰');
    await userEvent.click(within(sheet).getByRole('button', { name: '저장' }));
    expect(api.putCommunityProfile).toHaveBeenCalledTimes(1);
    await expectSlidesDownThenCloses('커뮤니티 닉네임');
  });

  it('건물 바꾸기: 건물을 고르면 내려간 다음에 그 건물로 바뀐다', async () => {
    api.getMyBuildings.mockResolvedValue([building(), SECOND]);
    renderAt('/landlord/community/briefing');
    await userEvent.click(await screen.findByRole('button', { name: /잠실한빛아파트.*건물 바꾸기/ }, FIRST_RENDER));
    const sheet = screen.getByRole('dialog', { name: '건물 바꾸기' });
    await userEvent.click(within(sheet).getAllByRole('radio')[1]);
    await waitFor(() => expect(transforms().at(-1)).toEqual(SLIDE_DOWN));
    expect(screen.getByRole('heading', { level: 1, name: /잠실한빛아파트/ })).toBeInTheDocument();
    await finishAll();
    expect(screen.queryByRole('dialog', { name: '건물 바꾸기' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: /해운대서강아파트/ })).toBeInTheDocument();
  });
});

describe('앱 커뮤니티: 시세를 일부만 모았을 때 모은 달의 데이터 — PC 와 같은 규칙 (#267 2차)', () => {
  const MONTHS = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
  const row = (yearMonth, dealCount, avgPrice = null) => ({ yearMonth, dealCount, avgPrice, minPrice: avgPrice, maxPrice: avgPrice, avgDeposit: null, avgMonthlyRent: null });
  const deal = (contractDate, price) => ({ contractDate, dealType: 'SALE', complexName: '잠실한빛아파트', exclusiveArea: 84.79, floor: 9, price, deposit: null, monthlyRent: null });
  const DEALS = { '2026-05': [2, 2000000000], '2026-07': [1, 2100000000], '2026-08': [1, 2200000000], '2026-10': [2, 2400000000], '2026-11': [1, 3000000000] };
  const RECENT = [deal('2026-11-05', 3000000000), deal('2026-10-28', 2400000000), deal('2026-05-20', 2000000000)];
  const partialSale = (missing, deals = DEALS) => ({
    ...MARKET_COLLECTING,
    asOf: '2026-11-16',
    collectionProgress: {
      requiredMonths: 13, collectedMonths: 13 - missing.length, failedMonths: missing.length, notTriedMonths: 0,
      lastAttemptedAt: '2026-11-26T17:32:00.000Z', lastFailedAt: '2026-11-24T17:32:00.000Z', lastErrorCode: '30',
    },
    monthly: MONTHS.map((yearMonth) => {
      if (missing.includes(yearMonth)) return { ...row(yearMonth, null), collected: false };
      return deals[yearMonth] ? { ...row(yearMonth, ...deals[yearMonth]), collected: true } : { ...row(yearMonth, 0), collected: true };
    }),
    recentDeals: RECENT.filter((item) => !missing.includes(item.contractDate.slice(0, 7)) && deals[item.contractDate.slice(0, 7)]),
  });
  const BASIS = '최근 13개월 중 8개월 기준 · 나머지는 매일 새벽 채워요';
  const basisIn = (scope) => within(scope).getByText((_, el) => el?.tagName === 'P' && el.textContent === BASIS);
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T03:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('시세 화면 · 오래된 5개월 빠짐: 안내 대신 대표 숫자 · 증감 · 차트("수집 중" 띠 · 범례) · 최근 거래, 출처 아래 "N개월 기준"', async () => {
    api.getComplexMarketPrices.mockResolvedValue(partialSale(MONTHS.slice(0, 5)));
    renderAt('/landlord/community/market');
    const card = await screen.findByRole('region', { name: '매매 시세' }, FIRST_RENDER);
    expect(within(card).getByText('23억 3,300만')).toBeInTheDocument();
    expect(within(card).getByText('직전 3개월보다 ▲14.8%')).toBeInTheDocument();
    expect(within(card).getByRole('img').querySelector('[data-missing-band]')).toHaveAttribute('data-missing-band', '2025-11~2026-03');
    expect(within(card).getByText('매매 수집 중', { selector: 'span' })).toBeInTheDocument();
    expect(basisIn(document.body)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: '최근 거래' })).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText(/시세를 모으는 중이에요|불러오지 못했어요/)).not.toBeInTheDocument();
  });

  it('시세 화면 · 띠는 주 선(매매) 기준 한 겹, 글자 "매매 수집 중" — 비교 선(전세)만 못 모으면 띠 없이 전세 선만 끊긴다(PC 와 같다)', async () => {
    const jeonseOf = (missing) => ({
      ...MARKET_COLLECTING,
      dealType: 'JEONSE',
      asOf: '2026-11-16',
      collectionStatus: missing.length ? 'COLLECTING' : 'READY',
      monthly: MONTHS.map((yearMonth) => {
        if (missing.includes(yearMonth)) return { ...row(yearMonth, null), collected: false };
        return { ...row(yearMonth, 2), avgDeposit: 1100000000, ...(missing.length ? { collected: true } : {}) };
      }),
      recentDeals: [],
    });
    // ⓐ 매매만 오래된 5개월 못 모음, 전세는 다 모음 → 띠 하나 "매매 수집 중", 전세 선은 띠 안에서도 이어진다
    api.getComplexMarketPrices.mockImplementation(async ({ dealType }) => (dealType === 'JEONSE' ? jeonseOf([]) : partialSale(MONTHS.slice(0, 5))));
    const first = renderAt('/landlord/community/market');
    let card = await screen.findByRole('region', { name: '매매 시세' }, FIRST_RENDER);
    let chart = within(card).getByRole('img');
    expect(chart.querySelectorAll('[data-missing-band]')).toHaveLength(1);
    expect(chart.querySelector('[data-missing-label]')).toHaveTextContent('매매 수집 중');
    expect(chart.querySelector('[data-series="전세"]').querySelector('circle[data-month="2025-12"]')).not.toBeNull();
    first.unmount();

    // ⓑ 매매는 다 모음(READY), 전세만 2026-09 못 모음 → 띠 · 범례 없음, 전세 선만 09 에서 끊김
    const saleReady = { ...partialSale([]), collectionStatus: 'READY', jobId: null, monthly: partialSale([]).monthly.map(({ collected, ...rest }) => rest) };
    api.getComplexMarketPrices.mockImplementation(async ({ dealType }) => (dealType === 'JEONSE' ? jeonseOf(['2026-09']) : saleReady));
    renderAt('/landlord/community/market');
    card = await screen.findByRole('region', { name: '매매 시세' }, FIRST_RENDER);
    chart = within(card).getByRole('img');
    expect(chart.querySelector('[data-missing-band]')).toBeNull();
    expect(within(card).queryByText(/수집 중/)).not.toBeInTheDocument();
    const jeonseLine = chart.querySelector('[data-series="전세"]');
    expect(jeonseLine.querySelector('circle[data-month="2026-09"]')).toBeNull();
    expect(jeonseLine.querySelectorAll('[data-segment="gap"]')).toHaveLength(0);
  });

  it('시세 화면 · 최근 달 빠짐(7 ~ 11월): "최근 3개월 평균은 모으는 중" · 큰 숫자 · 증감 없음, 최근 거래는 모은 달(5월)만', async () => {
    api.getComplexMarketPrices.mockResolvedValue(partialSale(MONTHS.slice(8)));
    renderAt('/landlord/community/market');
    const card = await screen.findByRole('region', { name: '매매 시세' }, FIRST_RENDER);
    expect(within(card).getByText('최근 3개월 평균은 모으는 중 · 60–85㎡')).toBeInTheDocument();
    expect(card.querySelector('.text-num-kpi')).toBeNull();
    expect(within(card).queryByText(/직전 3개월/)).not.toBeInTheDocument();
    const items = within(screen.getByRole('list', { name: '최근 거래' })).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('2026-05-20');
  });

  it('브리핑 · 오래된 5개월 빠짐: 시세 카드는 평균 · 증감 · "N개월 기준", 최근 거래 카드는 거래 + "N개월 기준"', async () => {
    api.getComplexMarketPrices.mockResolvedValue(partialSale(MONTHS.slice(0, 5)));
    renderAt('/landlord/community/briefing');
    const market = await screen.findByRole('region', { name: '시세' }, FIRST_RENDER);
    expect(await within(market).findByText('23억 3,300만')).toBeInTheDocument();
    expect(within(market).getByText('직전 3개월보다 ▲14.8%')).toBeInTheDocument();
    expect(basisIn(market)).toBeInTheDocument();
    const deals = screen.getByRole('region', { name: '최근 거래' });
    expect(within(within(deals).getByRole('list', { name: '최근 거래' })).getAllByRole('listitem')).toHaveLength(3);
    expect(basisIn(deals)).toBeInTheDocument();
  });

  it('브리핑 · 모은 달에 거래 없음: 최근 거래 "모은 8개월 동안 거래가 없습니다", 시세 "모은 8개월 동안 60–85㎡ 매매 거래가 없습니다"', async () => {
    api.getComplexMarketPrices.mockResolvedValue(partialSale(MONTHS.slice(0, 5), {}));
    renderAt('/landlord/community/briefing');
    const deals = await screen.findByRole('region', { name: '최근 거래' }, FIRST_RENDER);
    expect(await within(deals).findByText('모은 8개월 동안 거래가 없습니다')).toHaveAttribute('role', 'status');
    expect(within(deals).queryByText('최근 거래가 없습니다')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '시세' })).getByText('모은 8개월 동안 60–85㎡ 매매 거래가 없습니다')).toBeInTheDocument();
  });
});

// #274 — 앱도 PC 와 같은 규칙(같은 훅 useMarketBodyState · 같은 함수 pickAreaBands): 칩 = 그 단지 실거래 구간 + 내 호실 구간,
// 정보 없으면 4개, 하나면 글자, 브리핑은 기본 선택 구간으로. 면적은 로컬 실제 단지의 전용면적
describe('앱 커뮤니티: 면적대 칩은 그 단지가 가진 면적대만 — PC 와 같은 규칙 (#274)', () => {
  const PARKRIO = [35.24, 59.98, 84.79, 144.77]; // 85–105 거래 없음
  const JUNGGYE = [39.6, 49.85, 59.39]; // 60㎡ 이하만
  const open = (overrides, path = '/landlord/community/market') => {
    api.getMyBuildings.mockResolvedValue([building(overrides)]);
    renderAt(path);
  };
  const areaGroup = () => screen.findByRole('radiogroup', { name: '면적대' }, FIRST_RENDER);
  const chipTexts = (group) => within(group).getAllByRole('radio').map((radio) => radio.textContent);
  const checkedText = (group) => within(group).getByRole('radio', { checked: true }).textContent;
  const saleCalls = () => api.getComplexMarketPrices.mock.calls.map(([params]) => params).filter((params) => params.dealType === 'SALE');

  it('칩 3개(파크리오 모양) — 거래가 없는 85–105 는 빠지고, 내 호실 구간(점)이 기본', async () => {
    open({ unitAreas: [84.79], dealAreas: PARKRIO });
    const group = await areaGroup();
    expect(chipTexts(group)).toEqual(['60㎡ 이하', '60–85㎡', '105㎡ 초과']);
    expect(checkedText(group)).toBe('60–85㎡');
    expect(within(group).getByRole('radio', { checked: true }).querySelector('[aria-label="내 호실"]')).not.toBeNull();
    expect(screen.getByText('내 호실이 있는 면적대입니다')).toBeInTheDocument();
  });

  it('하나만 남음(중계그린 모양) — 칩 대신 글자 "전용 60㎡ 이하", 그 구간으로 부르고 내 호실 안내는 없다', async () => {
    open({ name: '중계그린아파트', unitAreas: [], dealAreas: JUNGGYE });
    expect(await screen.findByText('전용 60㎡ 이하', {}, FIRST_RENDER)).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: '면적대' })).not.toBeInTheDocument();
    expect(screen.queryByText('내 호실이 있는 면적대입니다')).not.toBeInTheDocument();
    await waitFor(() => expect(saleCalls().at(-1)).toEqual({ complexId: 'complex-1', dealType: 'SALE', areaMin: undefined, areaMax: 60 }));
  });

  it('하나만 남았는데 내 호실 구간이면 글자 + "내 호실이 있는 면적대입니다" 그대로', async () => {
    open({ name: '중계그린아파트', unitAreas: [49.85], dealAreas: JUNGGYE });
    expect(await screen.findByText('전용 60㎡ 이하', {}, FIRST_RENDER)).toBeInTheDocument();
    expect(screen.getByText('내 호실이 있는 면적대입니다')).toBeInTheDocument();
  });

  it('거래 정보 없음(빈 목록) — 지금처럼 4개, 60–85 로 시작', async () => {
    open({ unitAreas: [], dealAreas: [] });
    const group = await areaGroup();
    expect(chipTexts(group)).toEqual(['60㎡ 이하', '60–85㎡', '85–105㎡', '105㎡ 초과']);
    expect(checkedText(group)).toBe('60–85㎡');
  });

  it('내 호실 구간에 거래가 없어도 그 칩은 보이고(점) 기본으로 고른다', async () => {
    open({ unitAreas: [101.2], dealAreas: PARKRIO });
    const group = await areaGroup();
    expect(chipTexts(group)).toEqual(['60㎡ 이하', '60–85㎡', '85–105㎡', '105㎡ 초과']);
    expect(checkedText(group)).toBe('85–105㎡');
    expect(within(group).getByRole('radio', { checked: true }).querySelector('[aria-label="내 호실"]')).not.toBeNull();
  });

  it.each([
    ['① 내 호실 구간', { unitAreas: [144.77], dealAreas: PARKRIO }, '105㎡ 초과', { areaMin: 105, areaMax: undefined }],
    ['② 내 호실이 없으면 60–85 가 보일 때 60–85', { unitAreas: [], dealAreas: PARKRIO }, '60–85㎡', { areaMin: 60, areaMax: 85 }],
    ['③ 60–85 도 없으면 보이는 칩 중 첫째', { unitAreas: [], dealAreas: [59.9, 120.36] }, '60㎡ 이하', { areaMin: undefined, areaMax: 60 }],
  ])('기본 선택 %s', async (_name, overrides, checked, area) => {
    open(overrides);
    expect(checkedText(await areaGroup())).toBe(checked);
    await waitFor(() => expect(saleCalls().at(-1)).toEqual({ complexId: 'complex-1', dealType: 'SALE', ...area }));
  });

  it('고른 칩이 사라지면(건물 목록을 다시 받아 그 구간 거래가 빠짐) 기본 선택으로', async () => {
    api.getMyBuildings.mockResolvedValue([building({ unitAreas: [], dealAreas: PARKRIO })]);
    // 건물 목록을 바꿔 넣으려고 QueryClient 를 직접 둔다(안쪽 Provider 가 우선 — test/support/rtl.jsx)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/landlord/community/market']}>
          <Routes>
            <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} onUnauthorized={vi.fn()} />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const group = await areaGroup();
    await userEvent.click(within(group).getByRole('radio', { name: '105㎡ 초과' }));
    expect(checkedText(screen.getByRole('radiogroup', { name: '면적대' }))).toBe('105㎡ 초과');
    act(() => {
      client.setQueryData(['COMMUNITY_MY_BUILDINGS'], [building({ unitAreas: [], dealAreas: [59.98, 84.79] })]);
    });
    await waitFor(() => expect(chipTexts(screen.getByRole('radiogroup', { name: '면적대' }))).toEqual(['60㎡ 이하', '60–85㎡']));
    expect(checkedText(screen.getByRole('radiogroup', { name: '면적대' }))).toBe('60–85㎡');
    await waitFor(() => expect(saleCalls().at(-1)).toEqual({ complexId: 'complex-1', dealType: 'SALE', areaMin: 60, areaMax: 85 }));
  });

  it('브리핑 — 하나만 남은 단지(내 호실 면적 없음)는 시세 · 최근 거래 카드를 그 구간(60㎡ 이하)으로 연다', async () => {
    open({ name: '중계그린아파트', unitAreas: [], dealAreas: JUNGGYE }, '/landlord/community/briefing');
    expect(await screen.findByText('중계그린아파트 · 매매 · 60㎡ 이하', {}, FIRST_RENDER)).toBeInTheDocument();
    expect(screen.getByText('매매 · 60㎡ 이하')).toBeInTheDocument();
    await waitFor(() => expect(saleCalls().length).toBeGreaterThan(0));
    for (const params of saleCalls()) expect(params).toEqual({ complexId: 'complex-1', dealType: 'SALE', areaMin: undefined, areaMax: 60 });
  });
});
