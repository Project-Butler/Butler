// 임대인 앱 임대차 분쟁(3팀). 실패 조건: 앱에서 /disputes 가 '준비 중'으로 감 · 웹 제목 줄(PageHeader)이 상단 바와 겹쳐 제목이 둘 ·
// 상단 바 제목이 화면과 다름 · 사례 상세의 AI 버튼이 화면에 고정돼 따라다님 · AI 상담에 하단 탭이 남아 입력창과 겹침 · 주소로 바로 들어온 화면에서 뒤로 가기가 앱 밖으로 나감.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getDisputeReferenceList: vi.fn(),
  getDisputeReference: vi.fn(),
  getDisputeRelatedReferences: vi.fn(),
  getDisputeFaqList: vi.fn(),
  getDisputeChatList: vi.fn(),
  getDisputeChat: vi.fn(),
  postDisputeChat: vi.fn(),
  postDisputeChatMessage: vi.fn(),
  deleteDisputeChat: vi.fn(),
  getNotificationUnreadCount: vi.fn(),
}));

vi.mock('@butler/api-client', () => ({
  ...api,
  queryKey: {
    DISPUTE_REFERENCES: 'dispute_references',
    DISPUTE_REFERENCE_DETAIL: 'dispute_reference',
    DISPUTE_REFERENCE_RELATED: 'dispute_reference_related',
    DISPUTE_FAQS: 'dispute_faqs',
    DISPUTE_CHATS: 'dispute_chats',
    DISPUTE_CHAT_DETAIL: 'dispute_chat',
  },
}));

const { LandlordAppRoutes } = await import('../../src/landlord/app/LandlordAppRoutes');

const USER = { id: 'l-1', name: '최앱주', role: 'LANDLORD' };

const CASE_DETAIL = {
  id: 'ref-case',
  type: 'CASE',
  propertyKind: 'HOUSING',
  category: 'DAMAGES',
  title: '퇴거 후 벽지·장판 손상, 원상복구 비용은 어디까지?',
  summary: '통상 사용에 따른 마모는 임차인 부담이 아니라는 판단이 많았어요',
  keywords: ['원상복구'],
  sourceTitle: '2025 주택·상가건물 임대차분쟁 조정사례집 (한국부동산원)',
  sourcePage: 88,
  content: '[사실관계] 6년 거주 후 퇴거.\n[쟁점] 통상 손모와 과실 손상의 구분',
  outcome: '과실 손상 부분만 감가 후 일부 인정',
  caseNumber: null,
  relatedLaws: ['민법 제654조'],
};

const LocationProbe = () => {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
};
const where = () => screen.getByTestId('location').textContent;

const renderAt = (entry) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} onUnauthorized={vi.fn()} />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const topBarTitle = () => screen.getByRole('heading', { level: 1 });
const tabBar = () => screen.queryByRole('navigation', { name: '하단 메뉴' });

beforeEach(() => {
  vi.clearAllMocks();
  api.getDisputeReferenceList.mockResolvedValue({
    data: [],
    meta: { page: 1, size: 20, total: 0, hasNext: false, countsByType: { CASE: 0, PRECEDENT: 0, GUIDELINE: 0 }, countsByCategory: {} },
  });
  api.getDisputeFaqList.mockResolvedValue([]);
  api.getDisputeReference.mockResolvedValue(CASE_DETAIL);
  api.getDisputeRelatedReferences.mockResolvedValue([]);
  api.getDisputeChatList.mockResolvedValue({ data: [], meta: { page: 1, size: 50, total: 0, hasNext: false } });
  api.getNotificationUnreadCount.mockResolvedValue({ count: 0 });
});

describe('앱 분쟁 화면 틀', () => {
  it('첫 화면은 뒤로 가기 상단 바 + 하단 탭이고, 제목은 상단 바 하나뿐이다', async () => {
    renderAt('/landlord/disputes');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(topBarTitle()).toHaveTextContent('임대차 분쟁 센터');
    expect(tabBar()).toBeInTheDocument();
    expect(screen.queryByText('준비 중인 화면')).not.toBeInTheDocument();
  });

  it.each([
    ['/landlord/disputes/search', '자료 찾기'],
    ['/landlord/disputes/topics/deposit', '보증금 반환'],
  ])('%s 의 상단 바 제목은 %s', (entry, title) => {
    renderAt(entry);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(topBarTitle()).toHaveTextContent(title);
    expect(tabBar()).toBeInTheDocument();
  });

  it('사례 상세는 [AI로 내 상황에 적용해 보기]를 고정하지 않고 맨 아래에 둔다', async () => {
    renderAt('/landlord/disputes/references/ref-case');
    expect(topBarTitle()).toHaveTextContent('사례 상세');
    const button = await screen.findByRole('button', { name: /AI로 내 상황에 적용해 보기/ });
    expect(button.closest('.sticky, .fixed')).toBeNull();
    expect(tabBar()).toBeInTheDocument();
  });

  it('AI 상담은 하단 탭 없는 앱 틀로 열린다', () => {
    renderAt('/landlord/disputes/chat');
    expect(screen.getByRole('heading', { level: 1, name: 'AI 상담' })).toBeInTheDocument();
    expect(tabBar()).not.toBeInTheDocument();
  });
});

describe('주소로 바로 들어왔을 때 뒤로 가기', () => {
  it.each([
    ['/landlord/disputes', '/landlord/home'],
    ['/landlord/disputes/search', '/landlord/disputes'],
    ['/landlord/disputes/references/ref-case', '/landlord/disputes'],
    ['/landlord/disputes/chat', '/landlord/disputes'],
  ])('%s → %s', async (entry, expected) => {
    renderAt(entry);
    await userEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));
    expect(where()).toBe(expected);
  });
});
