import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisputePage } from '../src/pages/DisputePage';
import { DisputeReferenceDetailPage } from '../src/pages/DisputeReferenceDetailPage';
import { DisputeSearchPage } from '../src/pages/DisputeSearchPage';
import { buildLocation } from '../src/routes';
import { breakNumberedItems, splitSections } from '../src/utils/disputeReference';

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

const CASE_ITEM = {
  id: 'ref-case',
  type: 'CASE',
  propertyKind: 'HOUSING',
  category: 'DAMAGES',
  title: '퇴거 후 벽지·장판 손상, 원상복구 비용은 어디까지?',
  summary: '통상 사용에 따른 마모는 임차인 부담이 아니라는 판단이 많았어요',
  keywords: ['원상복구'],
  sourceTitle: '2025 주택·상가건물 임대차분쟁 조정사례집 (한국부동산원)',
  sourcePage: 88,
};

const CASE_DETAIL = {
  ...CASE_ITEM,
  content:
    '[사실관계] 6년 거주 후 퇴거. 임대인이 도배·장판 교체 비용 320만 원을 공제하려 함.\n[임대인 주장] 전체 교체가 필요하다.\n[쟁점] 통상 손모와 과실 손상의 구분\n[검토] 내용연수를 고려해 감가한다.',
  outcome: '과실 손상 부분만 감가 후 일부 인정',
  caseNumber: null,
  relatedLaws: ['민법 제654조', '민법 제615조'],
};

const RELATED = [
  { ...CASE_ITEM, id: 'ref-precedent', type: 'PRECEDENT', title: '통상 손모의 원상회복 범위', category: 'DAMAGES' },
];

const COUNTS_BY_CATEGORY = {
  RENT_ADJUSTMENT: 2,
  LEASE_TERM: 1,
  DEPOSIT_RETURN: 10,
  REPAIR_DUTY: 4,
  CONTRACT_INTERPRETATION: 7,
  RENEWAL_TERMINATION: 13,
  DAMAGES: 7,
  BROKERAGE_FEE: 2,
  PREMIUM: 3,
  GENERAL: 10,
};

const listResponse = (items, counts = { CASE: 25, PRECEDENT: 24, GUIDELINE: 10 }) => ({
  data: items,
  meta: { page: 1, size: 20, total: items.length, hasNext: false, countsByType: counts, countsByCategory: COUNTS_BY_CATEGORY },
});

const FAQS = [
  {
    key: 'restore-normal-wear',
    category: 'DAMAGES',
    question: '세입자가 나가면서 벽에 못 자국이 많아요. 도배비를 보증금에서 빼도 되나요?',
    answer: '통상의 손모는 특약이 없으면 임차인이 원상회복할 의무가 없어요.',
    references: [{ id: 'ref-case', type: 'CASE', category: 'DAMAGES', title: CASE_ITEM.title }],
  },
  {
    key: 'renewal-implicit-request',
    category: 'RENEWAL_TERMINATION',
    question: '세입자가 갱신하겠다고 분명히 말하지 않았는데도 갱신요구로 보나요?',
    answer: '묵시적으로 표시되어 기간 안에 도달하면 유효해요.',
    references: [],
  },
];

// 화면 폭(미디어 쿼리) 흉내. true면 PC 넓은 화면(오른쪽 AI 패널).
const setWide = (isWide) => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: isWide,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
};

const ChatProbe = () => {
  const { state } = useLocation();
  return <p>챗봇 화면 · {state?.draft ?? '질문 없음'}</p>;
};

const Harness = () => {
  const navigate = useNavigate();
  const onNavigate = (key, params = {}) => {
    const { pathname, search = '', state } = buildLocation(key, params);
    navigate({ pathname, search }, { state });
  };
  return (
    <Routes>
      <Route path="/disputes/chat" element={<ChatProbe />} />
      <Route path="/disputes" element={<DisputePage onNavigate={onNavigate} />}>
        <Route index element={<DisputeSearchPage />} />
        <Route path="references/:referenceId" element={<DisputeReferenceDetailPage />} />
      </Route>
    </Routes>
  );
};

const renderAt = (path) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const lastListParams = () => api.getDisputeReferenceList.mock.calls.at(-1)[0];

describe('분쟁 해결사', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    setWide(false);
    api.getDisputeReferenceList.mockResolvedValue(listResponse([CASE_ITEM]));
    api.getDisputeReference.mockResolvedValue(CASE_DETAIL);
    api.getDisputeRelatedReferences.mockResolvedValue(RELATED);
    // 서버처럼 유형(쉼표)·검색어로 거른다.
    api.getDisputeFaqList.mockImplementation(async ({ category, q } = {}) =>
      FAQS.filter(
        (faq) =>
          (!category || category.split(',').includes(faq.category)) &&
          (!q || `${faq.question}${faq.answer}`.includes(q)),
      ),
    );
    api.getDisputeChatList.mockResolvedValue({ data: [], meta: { page: 1, size: 20, total: 0, hasNext: false } });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('조건이 없으면 상황 타일에 자료 수와 대표 질문을 보여 준다', async () => {
    renderAt('/disputes');

    const tile = await screen.findByRole('button', { name: /7건\s*원상복구·손해배상/ });
    await waitFor(() => expect(tile).toHaveTextContent('도배비를 보증금에서 빼도 되나요?'));
    // 계약 갱신·종료 타일은 갱신·종료(13)와 임대차 기간(1)을 합친다.
    expect(screen.getByRole('button', { name: /14건\s*계약 갱신·종료/ })).toBeInTheDocument();
    // 법률 자문 아님 안내는 위 칩 대신 맨 아래 안내문 하나로 둔다.
    expect(screen.queryByText('법률 자문 아님')).not.toBeInTheDocument();
    expect(screen.getByText(/법률 자문이 아닙니다/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '결과 종류' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '처음으로' })).not.toBeInTheDocument();
    // 타일과 같은 정보라 처음 화면에는 상황 칩을 두지 않는다.
    expect(screen.queryByRole('group', { name: '상황' })).not.toBeInTheDocument();
  });

  it('타일을 누르면 같은 화면에서 그 상황의 질문과 사례를 함께 보여 준다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes');

    await user.click(await screen.findByRole('button', { name: /7건\s*원상복구·손해배상/ }));

    expect(screen.getByRole('button', { name: '원상복구·손해배상' })).toHaveAttribute('aria-pressed', 'true');
    const question = await screen.findByRole('button', { name: /못 자국이 많아요/ });
    expect(question).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText(/갱신요구로 보나요/)).not.toBeInTheDocument();
    // 질문 아래 사례 카드(요약이 보이는 카드)가 이어진다.
    expect(await screen.findByText(CASE_ITEM.summary)).toBeInTheDocument();
    // 전체 탭: 질문 1 + 자료 25·24·10. 전체 탭은 종류를 거르지 않는다.
    expect(await screen.findByRole('button', { name: /^전체\s*60$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^질문\s*1$/ })).toBeInTheDocument();
    expect(lastListParams()).toMatchObject({ category: 'DAMAGES', type: undefined });
    expect(api.getDisputeFaqList).toHaveBeenLastCalledWith({ category: 'DAMAGES', q: undefined });
  });

  it('검색창 하나로 질문과 사례를 같은 검색어로 함께 찾는다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes');

    await user.type(await screen.findByLabelText('분쟁 질문·사례 검색'), '도배비');

    expect(await screen.findByRole('button', { name: /못 자국이 많아요/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/갱신요구로 보나요/)).not.toBeInTheDocument());
    await waitFor(() => expect(lastListParams()).toMatchObject({ q: '도배비' }));
    expect(api.getDisputeFaqList).toHaveBeenLastCalledWith({ category: undefined, q: '도배비' });
    expect(screen.getByRole('heading', { name: '분쟁 해결사' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '검색어 지우기' }));
    expect(await screen.findByText('어떤 상황인가요?')).toBeInTheDocument();
  });

  it('결과 화면의 [처음으로]는 검색어·상황을 모두 지우고 상황 타일로 돌아간다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes?topic=restore&q=%EB%8F%84%EB%B0%B0');
    await screen.findByRole('button', { name: /못 자국이 많아요/ });

    await user.click(screen.getByRole('button', { name: '처음으로' }));

    expect(await screen.findByText('어떤 상황인가요?')).toBeInTheDocument();
    expect(screen.getByLabelText('분쟁 질문·사례 검색')).toHaveValue('');
    expect(screen.queryByRole('group', { name: '상황' })).not.toBeInTheDocument();
  });

  it('자료는 5개씩 쪽으로 나눠 넘기고 지금 위치(총 몇 건 중 몇–몇)를 보여 주며, 전체 탭은 질문을 3개만 미리 보여 준다', async () => {
    const user = userEvent.setup();
    const manyFaqs = Array.from({ length: 5 }, (_, i) => ({ ...FAQS[0], key: `faq-${i}`, question: `원상복구 질문 ${i + 1}` }));
    api.getDisputeFaqList.mockResolvedValue(manyFaqs);
    api.getDisputeReferenceList.mockResolvedValue({
      data: [CASE_ITEM],
      meta: { page: 1, size: 5, total: 25, hasNext: true, countsByType: { CASE: 25, PRECEDENT: 0, GUIDELINE: 0 }, countsByCategory: COUNTS_BY_CATEGORY },
    });
    renderAt('/disputes?topic=restore');

    expect(await screen.findByText('원상복구 질문 3')).toBeInTheDocument();
    expect(screen.queryByText('원상복구 질문 4')).not.toBeInTheDocument();
    expect(lastListParams()).toMatchObject({ page: 1, size: 5 });
    expect(screen.getByText('총 25건 중 1–5')).toBeInTheDocument();

    const pages = screen.getByRole('navigation', { name: '자료 쪽 이동' });
    expect(within(pages).getByRole('button', { name: '1쪽' })).toHaveAttribute('aria-current', 'page');
    expect(within(pages).getByRole('button', { name: '5쪽' })).toBeInTheDocument();
    await user.click(within(pages).getByRole('button', { name: '다음 쪽' }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 2 }));
    expect(screen.getByText('총 25건 중 6–10')).toBeInTheDocument();
    // 2쪽부터는 질문 미리보기를 다시 보여 주지 않는다.
    expect(screen.queryByText('원상복구 질문 1')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^질문\s*5$/ }));
    expect(await screen.findByText('원상복구 질문 5')).toBeInTheDocument();
  });

  it('상황을 고른 뒤 새로 검색하면 상황을 풀고 전체에서 찾고, 그 뒤 칩을 누르면 검색 결과를 좁힌다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes?topic=renewal');
    await screen.findByText(/갱신요구로 보나요/);

    await user.type(screen.getByLabelText('분쟁 질문·사례 검색'), '도배비');

    await waitFor(() => expect(lastListParams()).toMatchObject({ q: '도배비', category: undefined }));
    expect(screen.getByRole('button', { name: '계약 갱신·종료' })).toHaveAttribute('aria-pressed', 'false');
    expect(await screen.findByRole('button', { name: /못 자국이 많아요/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '원상복구·손해배상' }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ q: '도배비', category: 'DAMAGES' }));
  });

  it('결과 탭을 고르면 그 종류만 보여 준다(질문 탭은 질문만, 판례 탭은 판례만)', async () => {
    const user = userEvent.setup();
    renderAt('/disputes?topic=restore');
    await screen.findByRole('button', { name: /못 자국이 많아요/ });

    await user.click(await screen.findByRole('button', { name: /^판례\s*24$/ }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ type: 'PRECEDENT', category: 'DAMAGES' }));
    expect(screen.queryByRole('button', { name: /못 자국이 많아요/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^질문\s*1$/ }));
    expect(await screen.findByRole('button', { name: /못 자국이 많아요/ })).toBeInTheDocument();
    // 사례 카드(요약이 보이는 카드)는 없다. 질문의 근거 줄에는 같은 제목이 있을 수 있다.
    expect(screen.queryByText(CASE_ITEM.summary)).not.toBeInTheDocument();
  });

  it('여러 유형을 묶은 상황은 쉼표로 함께 거르고, 칩으로 바로 다른 상황으로 바꾸며, 검색어 없이 고른 칩을 다시 눌러도 처음 화면으로 가지 않는다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes?topic=renewal');

    await waitFor(() => expect(lastListParams()).toMatchObject({ category: 'RENEWAL_TERMINATION,LEASE_TERM' }));
    expect(await screen.findByText(/갱신요구로 보나요/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '보증금 반환' }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ category: 'DEPOSIT_RETURN' }));

    await user.click(screen.getByRole('button', { name: '보증금 반환' }));
    expect(screen.queryByText('어떤 상황인가요?')).not.toBeInTheDocument();
    expect(lastListParams()).toMatchObject({ category: 'DEPOSIT_RETURN' });
  });

  it('질문의 근거 자료를 누르면 사례 상세(구간별 카드·결과·관련 자료)로 가고, 뒤로 가면 보던 상황으로 돌아온다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes?topic=restore');

    const faqAnswer = (await screen.findByText(/통상의 손모는 특약이 없으면/)).closest('div');
    await user.click(within(faqAnswer).getByRole('button', { name: /퇴거 후 벽지/ }));

    expect(await screen.findByRole('heading', { name: CASE_ITEM.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '상황' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '쟁점' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '조정 결과' })).toBeInTheDocument();
    expect(screen.getByText('민법 제654조, 민법 제615조')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /통상 손모의 원상회복 범위/ })).toBeInTheDocument();
    expect(api.getDisputeReference).toHaveBeenCalledWith('ref-case');

    await user.click(screen.getByRole('button', { name: '뒤로' }));
    expect(await screen.findByRole('button', { name: '원상복구·손해배상' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('결과가 없으면 알려 주고, 좁은 화면에서 [AI에게 물어보기]는 검색어를 들고 챗봇 화면으로 간다', async () => {
    const user = userEvent.setup();
    api.getDisputeReferenceList.mockResolvedValue(listResponse([], { CASE: 0, PRECEDENT: 0, GUIDELINE: 0 }));
    renderAt('/disputes?q=%EB%B0%98%EB%A0%A4%EA%B2%AC');

    expect(await screen.findByText('맞는 질문이나 사례를 찾지 못했어요')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'AI에게 물어보기' }));

    expect(screen.getByText('챗봇 화면 · 반려견')).toBeInTheDocument();
  });

  it('좁은 화면에서 [내 상황에 적용해 보기]는 사례 제목을 넣은 질문을 들고 챗봇 화면으로 간다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes/references/ref-case');

    await user.click(await screen.findByRole('button', { name: '내 상황에 적용해 보기' }));

    expect(screen.getByText(/챗봇 화면 · "퇴거 후 벽지·장판 손상/)).toBeInTheDocument();
  });

  it('넓은 화면은 오른쪽 AI 패널을 접어 두었다가, [내 상황에 적용해 보기]로 질문을 채워 연다', async () => {
    setWide(true);
    const user = userEvent.setup();
    renderAt('/disputes/references/ref-case');

    const panel = screen.getByRole('complementary', { name: 'AI 상담' });
    expect(within(panel).getByText('찾는 사례가 없나요?')).toBeInTheDocument();
    expect(within(panel).queryByLabelText('상담 질문')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: '내 상황에 적용해 보기' }));

    expect(within(panel).getByLabelText('상담 질문')).toHaveValue(
      `"${CASE_ITEM.title}" 사례가 제 상황에도 해당하는지 알고 싶어요.\n제 상황: `,
    );
    // 페이지는 그대로(사례 상세)
    expect(screen.getByRole('heading', { name: CASE_ITEM.title })).toBeInTheDocument();
  });
});

describe('splitSections', () => {
  it('조정사례 본문을 구간 제목으로 나누고, [사실관계]는 "상황"으로 바꾼다', () => {
    expect(splitSections('[사실관계] 가\n[쟁점] 나', 'CASE')).toEqual([
      { title: '상황', body: '가' },
      { title: '쟁점', body: '나' },
    ]);
  });

  it('구간 제목이 없는 판례 본문은 한 덩어리로 둔다', () => {
    expect(splitSections('통상의 손모는 원상회복 대상이 아니다.', 'PRECEDENT')).toEqual([
      { title: '판시 내용', body: '통상의 손모는 원상회복 대상이 아니다.' },
    ]);
  });

  it('요지가 따로 없는 판례 원문은 본문을 "판결 요지"로 두고, 원문 대괄호에서 나누지 않는다', () => {
    expect(splitSections('[다수의견] 가 [별표 1] 나', 'PRECEDENT', { hasOutcome: false })).toEqual([
      { title: '판결 요지', body: '[다수의견] 가 [별표 1] 나' },
    ]);
  });

  it('[임대인 측 주장]도 구간 제목으로 나눈다', () => {
    expect(splitSections('[임대인 측 주장] 가', 'CASE')).toEqual([{ title: '임대인 측 주장', body: '가' }]);
  });
});

describe('breakNumberedItems', () => {
  it('[1] [2] 번호 앞에서 줄을 바꾸고, 맨 앞 번호는 그대로 둔다', () => {
    expect(breakNumberedItems('[1] 가 [2] 나  [3] 다')).toBe('[1] 가\n[2] 나\n[3] 다');
  });
});
