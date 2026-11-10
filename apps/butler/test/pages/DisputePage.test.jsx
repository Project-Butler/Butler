import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisputeHomePage } from '../../src/landlord/web/pages/DisputeHomePage';
import { DisputePage } from '../../src/landlord/web/pages/DisputePage';
import { DisputeReferenceDetailPage } from '../../src/landlord/web/pages/DisputeReferenceDetailPage';
import { DisputeSearchPage } from '../../src/landlord/web/pages/DisputeSearchPage';
import { DisputeTopicPage } from '../../src/landlord/web/pages/DisputeTopicPage';
import { buildLocation } from '../../src/landlord/web/routes';
import { HELP_ROUTES, TOPIC_BRIEFINGS } from '../../src/landlord/web/utils/disputePortal';
import { breakNumberedItems, splitSections } from '../../src/landlord/web/utils/disputeReference';

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
    references: [
      { id: 'ref-case', type: 'CASE', category: 'DAMAGES', title: CASE_ITEM.title, sourceTitle: '2025 주택·상가건물 임대차분쟁 조정사례집' },
    ],
  },
  {
    key: 'renewal-implicit-request',
    category: 'RENEWAL_TERMINATION',
    question: '세입자가 갱신하겠다고 분명히 말하지 않았는데도 갱신요구로 보나요?',
    answer: '묵시적으로 표시되어 기간 안에 도달하면 유효해요.',
    references: [],
  },
  {
    key: 'rent-increase-cap',
    category: 'RENT_ADJUSTMENT',
    question: '갱신할 때 월세를 얼마까지 올릴 수 있나요?',
    answer: '갱신할 때는 기존 금액의 5%를 넘게 올릴 수 없어요.',
    references: [],
  },
];

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
      <Route path="/landlord/disputes/chat" element={<ChatProbe />} />
      <Route path="/landlord/disputes" element={<DisputePage onNavigate={onNavigate} />}>
        <Route index element={<DisputeHomePage />} />
        <Route path="search" element={<DisputeSearchPage />} />
        <Route path="topics/:topicKey" element={<DisputeTopicPage />} />
        <Route path="references/:referenceId" element={<DisputeReferenceDetailPage />} />
      </Route>
    </Routes>
  );
};

const renderAt = (path) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/landlord${path}`]}>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const lastListParams = () => api.getDisputeReferenceList.mock.calls.at(-1)[0];

describe('분쟁 해결사', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('조건 없이 들어오면 전체 자료와 상황 칩을 보여 주고, 칩을 누르면 그 상황의 질문과 사례로 좁힌다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes/search');

    await waitFor(() => expect(lastListParams()).toMatchObject({ category: undefined, q: undefined, page: 1, size: 5 }));
    expect(screen.getByRole('group', { name: '상황' })).toBeInTheDocument();
    expect(screen.queryByText('어떤 상황인가요?')).not.toBeInTheDocument();
    // 법률 자문 아님 안내는 맨 아래 안내문 하나로 둔다.
    expect(screen.getByText(/법률 자문이 아닙니다/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '원상복구·손해배상' }));

    expect(screen.getByRole('button', { name: '원상복구·손해배상' })).toHaveAttribute('aria-pressed', 'true');
    const question = await screen.findByRole('button', { name: /못 자국이 많아요/ });
    expect(question).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText(/갱신요구로 보나요/)).not.toBeInTheDocument();
    expect(await screen.findByText(CASE_ITEM.summary)).toBeInTheDocument();
    // 전체 탭: 질문 1 + 자료 25·24·10. 전체 탭은 종류를 거르지 않는다.
    expect(await screen.findByRole('button', { name: /^전체\s*60$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^질문\s*1$/ })).toBeInTheDocument();
    expect(lastListParams()).toMatchObject({ category: 'DAMAGES', type: undefined });
    expect(api.getDisputeFaqList).toHaveBeenLastCalledWith({ category: 'DAMAGES', q: undefined });
  });

  it('검색창 하나로 질문과 사례를 같은 검색어로 함께 찾는다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes/search');

    await user.type(await screen.findByLabelText('분쟁 질문·사례 검색'), '도배비');

    expect(await screen.findByRole('button', { name: /못 자국이 많아요/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/갱신요구로 보나요/)).not.toBeInTheDocument());
    await waitFor(() => expect(lastListParams()).toMatchObject({ q: '도배비' }));
    expect(api.getDisputeFaqList).toHaveBeenLastCalledWith({ category: undefined, q: '도배비' });
    expect(screen.getByRole('heading', { name: '자료 찾기' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '검색어 지우기' }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ q: undefined }));
    expect(screen.queryByText('어떤 상황인가요?')).not.toBeInTheDocument();
  });

  it('모든 단어가 들어간 자료가 없어 서버가 조건을 완화하면(partialMatch) 일부 단어만 들어간 결과라고 알린다', async () => {
    api.getDisputeReferenceList.mockImplementation(async ({ q } = {}) => {
      const response = listResponse([CASE_ITEM]);
      return q ? { ...response, meta: { ...response.meta, partialMatch: { matchedTermCount: 2, termCount: 4 } } } : response;
    });
    renderAt('/disputes/search?q=집주인이%20보증금을%20안%20돌려줘요');

    expect(await screen.findByRole('status')).toHaveTextContent('일부 단어만 들어간 자료를 보여 드려요');
    expect(screen.getByRole('status')).toHaveTextContent('4개 중 최대 2개');
    expect(screen.getByText(CASE_ITEM.summary)).toBeInTheDocument();
  });

  it('질문도 서버가 조건을 완화하면(질문마다 partialMatch) 일부 단어만 들어간 질문이라고 알린다', async () => {
    api.getDisputeFaqList.mockResolvedValue([{ ...FAQS[0], partialMatch: { matchedTermCount: 1, termCount: 2 } }]);
    renderAt('/disputes/search?q=도배%20반려동물');

    expect(await screen.findByRole('status')).toHaveTextContent('일부 단어만 들어간 질문을 보여 드려요');
    expect(screen.getByRole('status')).toHaveTextContent('2개 중 최대 1개');
    expect(screen.getByRole('button', { name: /못 자국이 많아요/ })).toBeInTheDocument();
  });

  it('오타 제안(suggestion)이 오면 "혹시 ○○을(를) 찾으셨나요?"를 보이고, 누르면 그 말로 다시 찾는다', async () => {
    const user = userEvent.setup();
    api.getDisputeReferenceList.mockImplementation(async ({ q } = {}) => {
      const response = listResponse(q === '보증굼' ? [] : [CASE_ITEM]);
      const suggestion = q === '보증굼' ? { query: '보증금', corrections: [{ from: '보증굼', to: '보증금' }] } : null;
      return { ...response, meta: { ...response.meta, suggestion } };
    });
    renderAt('/disputes/search?q=보증굼');

    const button = await screen.findByRole('button', { name: '보증금' });
    expect(button.closest('p')).toHaveTextContent('혹시 보증금을 찾으셨나요?'); // 받침 있으면 "을"
    await user.click(button);

    await waitFor(() => expect(lastListParams()).toMatchObject({ q: '보증금' }));
    expect(screen.getByLabelText('분쟁 질문·사례 검색')).toHaveValue('보증금');
    await waitFor(() => expect(screen.queryByText(/찾으셨나요/)).not.toBeInTheDocument());
  });

  it.each([
    ['전세 사기', '혹시 전세 사기를 찾으셨나요?'], // 받침 없음 → "를"
    ['2020다226452', '혹시 2020다226452을(를) 찾으셨나요?'], // 끝이 숫자 → "을(를)"
  ])('제안 문구의 조사는 끝 글자 받침에 맞춘다: %s', async (query, sentence) => {
    api.getDisputeReferenceList.mockImplementation(async () => {
      const response = listResponse([]);
      return { ...response, meta: { ...response.meta, suggestion: { query, corrections: [] } } };
    });
    renderAt('/disputes/search?q=아무말');

    const button = await screen.findByRole('button', { name: query });
    expect(button.closest('p')).toHaveTextContent(sentence);
  });

  it('조건을 완화하지 않은 결과에는 일부 단어 안내를 보이지 않는다', async () => {
    renderAt('/disputes/search?q=도배비');

    expect(await screen.findByText(CASE_ITEM.summary)).toBeInTheDocument();
    expect(screen.queryByText(/모든 단어가 들어간 자료가 없어서/)).not.toBeInTheDocument();
  });

  it('첫 화면의 [사례·판례 전체 보기]는 조건 없는 자료 찾기로 가고, [뒤로]는 첫 화면으로 간다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes');

    await user.click(await screen.findByRole('button', { name: '사례·판례 전체 보기' }));
    expect(await screen.findByRole('heading', { name: '자료 찾기' })).toBeInTheDocument();
    await waitFor(() => expect(lastListParams()).toMatchObject({ type: undefined, category: undefined, q: undefined }));

    await user.click(screen.getByRole('button', { name: '뒤로' }));
    expect(await screen.findByRole('heading', { name: '임대차 분쟁 센터' })).toBeInTheDocument();
  });

  it('자료 찾기에서 칩을 여러 번 눌렀다 풀어도 기록이 쌓이지 않아 [뒤로] 한 번에 첫 화면으로 간다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes');

    await user.click(await screen.findByRole('button', { name: '사례·판례 전체 보기' }));
    await screen.findByRole('heading', { name: '자료 찾기' });
    for (const name of ['보증금 반환', '보증금 반환', '수리 책임', '수리 책임']) {
      await user.click(screen.getByRole('button', { name }));
    }

    await user.click(screen.getByRole('button', { name: '뒤로' }));
    expect(await screen.findByRole('heading', { name: '임대차 분쟁 센터' })).toBeInTheDocument();
  });

  it('상황 안내에서 질문 칩을 여러 번 눌렀다 풀어도 기록이 쌓이지 않아 [뒤로] 한 번에 첫 화면으로 간다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes');

    await user.click(await screen.findByRole('button', { name: /^보증금 반환/ }));
    await screen.findByRole('heading', { name: '보증금 반환' });
    for (const name of ['새 임차인을 못 구했을 때', '공제할 수 있는 비용', '공제할 수 있는 비용', '일부만 돌려줄 때']) {
      await user.click(screen.getByRole('button', { name }));
    }

    await user.click(screen.getByRole('button', { name: '뒤로' }));
    expect(await screen.findByRole('heading', { name: '임대차 분쟁 센터' })).toBeInTheDocument();
  });

  it('주소로 바로 들어온 자료 찾기의 [뒤로]는 임대차 분쟁 센터로 간다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes/search?q=%EB%8F%84%EB%B0%B0');

    await user.click(await screen.findByRole('button', { name: '뒤로' }));
    expect(await screen.findByRole('heading', { name: '임대차 분쟁 센터' })).toBeInTheDocument();
  });

  it('자료는 5개씩 쪽으로 나눠 넘기고 지금 위치(총 몇 건 중 몇–몇)를 보여 주며, 전체 탭은 질문을 3개만 미리 보여 준다', async () => {
    const user = userEvent.setup();
    const manyFaqs = Array.from({ length: 5 }, (_, i) => ({ ...FAQS[0], key: `faq-${i}`, question: `원상복구 질문 ${i + 1}` }));
    api.getDisputeFaqList.mockResolvedValue(manyFaqs);
    api.getDisputeReferenceList.mockResolvedValue({
      data: [CASE_ITEM],
      meta: { page: 1, size: 5, total: 25, hasNext: true, countsByType: { CASE: 25, PRECEDENT: 0, GUIDELINE: 0 }, countsByCategory: COUNTS_BY_CATEGORY },
    });
    renderAt('/disputes/search?topic=restore');

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
    renderAt('/disputes/search?topic=renewal');
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
    renderAt('/disputes/search?topic=restore');
    await screen.findByRole('button', { name: /못 자국이 많아요/ });

    await user.click(await screen.findByRole('button', { name: /^판례\s*24$/ }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ type: 'PRECEDENT', category: 'DAMAGES' }));
    expect(screen.queryByRole('button', { name: /못 자국이 많아요/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^질문\s*1$/ }));
    expect(await screen.findByRole('button', { name: /못 자국이 많아요/ })).toBeInTheDocument();
    // 사례 카드(요약이 보이는 카드)는 없다. 질문의 근거 줄에는 같은 제목이 있을 수 있다.
    expect(screen.queryByText(CASE_ITEM.summary)).not.toBeInTheDocument();
  });

  it('여러 유형을 묶은 상황은 쉼표로 함께 거르고, 칩으로 바로 다른 상황으로 바꾸며, 고른 칩을 다시 누르면 전체로 돌아간다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes/search?topic=renewal');

    await waitFor(() => expect(lastListParams()).toMatchObject({ category: 'RENEWAL_TERMINATION,LEASE_TERM' }));
    expect(await screen.findByText(/갱신요구로 보나요/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '보증금 반환' }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ category: 'DEPOSIT_RETURN' }));

    await user.click(screen.getByRole('button', { name: '보증금 반환' }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ category: undefined }));
    expect(screen.getByRole('button', { name: '보증금 반환' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('질문의 근거 자료를 누르면 사례 상세(구간별 카드·결과·관련 자료)로 가고, 뒤로 가면 보던 상황으로 돌아온다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes/search?topic=restore');

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

  it('결과가 없으면 알려 주고, 아래에 자료 출처·기관 연락처를 두며, 맨 끝 [AI에게 물어보기]는 검색어를 들고 챗봇 화면으로 간다', async () => {
    const user = userEvent.setup();
    api.getDisputeReferenceList.mockResolvedValue(listResponse([], { CASE: 0, PRECEDENT: 0, GUIDELINE: 0 }));
    renderAt('/disputes/search?q=%EB%B0%98%EB%A0%A4%EA%B2%AC');

    expect(await screen.findByText('맞는 질문이나 사례를 찾지 못했어요')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '자료 출처' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '기관 연락처' })).getByRole('link', { name: '132' })).toHaveAttribute('href', 'tel:132');
    await user.click(screen.getByRole('button', { name: 'AI에게 물어보기' }));

    expect(screen.getByText('챗봇 화면 · 반려견')).toBeInTheDocument();
  });

  it('사례 상세 하단 [내 상황에 적용해 보기]는 사례 제목을 넣은 질문을 들고 챗봇 화면으로 간다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes/references/ref-case');

    await user.click(await screen.findByRole('button', { name: '내 상황에 적용해 보기' }));

    expect(screen.getByText(/챗봇 화면 · "퇴거 후 벽지·장판 손상/)).toBeInTheDocument();
  });

  it('AI는 오른쪽에 붙여 두지 않고, 첫 화면에는 입구가 없으며, 상황 안내를 다 읽은 맨 끝에서 챗봇 화면으로 간다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes');

    expect(screen.getByRole('heading', { name: '임대차 분쟁 센터' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /AI/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^원상복구·손해배상/ }));
    expect(await screen.findByText('답을 찾지 못하셨나요?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'AI에게 물어보기' }));

    expect(screen.getByText(/챗봇 화면 · 원상복구·손해배상 문제로 상담하고 싶어요/)).toBeInTheDocument();
  });

  it('첫 화면은 유형(쉬운 이름·대표 질문)·도움받을 곳·자료 출처·기관 연락처만 보여 주는 브리핑이다', () => {
    renderAt('/disputes');

    expect(screen.getByRole('heading', { name: '임대차 분쟁 센터' })).toBeInTheDocument();
    const names = screen.getAllByRole('button').map((button) => button.textContent);
    for (const label of ['보증금 반환', '월세·보증금 조정', '수리 책임', '계약 갱신·종료', '원상복구·손해배상', '기타']) {
      expect(names.some((name) => name.startsWith(label))).toBe(true);
    }
    // 쉬운 이름 아래 대표 질문만 둔다(분류 기준은 코드에만 두고 화면에는 적지 않는다).
    expect(screen.getByText('바로 돌려줄 돈이 없다면?')).toBeInTheDocument();
    expect(screen.queryByText(/법정 분류|분류 기준/)).not.toBeInTheDocument();
    expect(screen.getByText('합의는 어렵지만 소송까지는 원하지 않을 때')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /조정 신청/ })).toHaveAttribute('href', expect.stringContaining('dispute/dispute.do'));
    expect(within(screen.getByRole('region', { name: '자료 출처' })).getByRole('link', { name: /국가법령정보센터/ })).toHaveAttribute('href', 'https://www.law.go.kr');
    expect(within(screen.getByRole('region', { name: '기관 연락처' })).getByRole('link', { name: '132' })).toHaveAttribute('href', 'tel:132');
    expect(within(screen.getByRole('region', { name: '기관 연락처' })).getByRole('link', { name: '1644-5599' })).toHaveAttribute('href', 'tel:1644-5599');
    // 자주 묻는 질문 5개는 원본 사례·상담에 많이 나온 순서
    const popular = within(screen.getByText('자주 묻는 질문').parentElement).getAllByRole('button').map((button) => button.textContent);
    expect(popular.slice(0, 5)).toEqual([
      '실거주로 갱신을 거절할 수 있나요?',
      '월세 얼마까지 올릴 수 있나요?',
      '세입자가 중간에 나가겠대요',
      '묵시적 갱신 후 해지하면?',
      '보증금에서 수리비를 빼려면?',
    ]);
    // 최근 이슈(뉴스)는 첫 화면에서 뺐다.
    expect(screen.queryByText('최근 임대차 이슈')).not.toBeInTheDocument();
  });

  it('첫 화면 자주 묻는 질문을 누르면 그 상황 안내에서 답을 바로 펼친다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes');

    await user.click(screen.getByRole('button', { name: '월세 얼마까지 올릴 수 있나요?' }));

    expect(await screen.findByRole('heading', { name: '월세·보증금 조정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '얼마까지 올릴 수 있나' })).toHaveAttribute('aria-pressed', 'true');
    const selected = await screen.findByRole('region', { name: '고른 질문' });
    expect(await within(selected).findByText(/5%를 넘게 올릴 수 없어요/)).toBeInTheDocument();
  });

  it('상황 안내 맨 위 질문 칩을 누르면 그 질문을 고른 칩으로 표시하고 답을 바로 아래 펼치며, 다시 누르면 푼다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes/topics/restore');

    expect(await screen.findByRole('heading', { name: '원상복구·손해배상' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '원상복구 범위' }));

    expect(screen.getByRole('button', { name: '원상복구 범위' })).toHaveAttribute('aria-pressed', 'true');
    const selected = await screen.findByRole('region', { name: '고른 질문' });
    const question = await within(selected).findByRole('button', { name: /못 자국이 많아요/ });
    expect(question).toHaveAttribute('aria-expanded', 'true');
    expect(within(selected).getByText(/통상의 손모는 특약이 없으면/)).toBeInTheDocument();
    // 답 아래에 근거 자료를 낸 곳을 적는다.
    expect(within(selected).getByText('출처 · 2025 주택·상가건물 임대차분쟁 조정사례집')).toBeInTheDocument();

    // 고른 칩을 다시 누르면 풀리고 답도 접힌다.
    await user.click(screen.getByRole('button', { name: '원상복구 범위' }));
    expect(screen.getByRole('button', { name: '원상복구 범위' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('region', { name: '고른 질문' })).not.toBeInTheDocument();
  });

  it('첫 화면에서 유형 카드 머리를 누르면 상황 안내로 간다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes');

    await user.click(screen.getByRole('button', { name: /^원상복구·손해배상/ }));

    expect(await screen.findByRole('heading', { name: '원상복구·손해배상' })).toBeInTheDocument();
    expect(screen.getByText(/자연스럽게 닳은 건 책임이 아니에요/)).toBeInTheDocument();
  });

  it('보증금 반환 안내는 번호 단계 5개를 처음부터 모두 펼쳐 그 단계의 자료·서식·기관을 보여 주고, 접을 수 있다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes/topics/deposit');

    expect(await screen.findByRole('heading', { name: '보증금 반환' })).toBeInTheDocument();
    const steps = within(screen.getByRole('region', { name: '해결 단계' })).getAllByRole('button', { expanded: true });
    expect(steps.map((step) => step.textContent.replace(/접기$/, ''))).toEqual(['지금 상황 확인', '협의', '문서로 알리기', '분쟁조정', '법원']);
    expect(screen.getByRole('heading', { name: '먼저 확인하세요' })).toBeInTheDocument();
    expect(screen.getByText('공제 금액으로 다투는 경우')).toBeInTheDocument();
    for (const name of ['준비할 자료', '서식·도구', '도움받을 곳']) {
      expect(screen.getAllByRole('heading', { name }).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole('link', { name: /내용증명 보내기/ })).toHaveAttribute('href', expect.stringContaining('econprf.RetrieveEConprfReqSend'));
    expect(screen.getByRole('link', { name: /보증금 공탁/ })).toHaveAttribute('href', 'https://ekt.scourt.go.kr');
    // 서식·도구는 기관 메인이 아니라 그 기능 페이지로 바로 간다.
    expect(screen.getByRole('link', { name: /전월세 전환 계산기/ })).toHaveAttribute('href', expect.stringContaining('transferCalculatorForm.do'));
    expect(screen.getByRole('link', { name: /주택임대차 표준계약서/ })).toHaveAttribute('href', expect.stringContaining('downloadContract.do'));
    expect(screen.getAllByRole('link', { name: /조정 신청/ })[0]).toHaveAttribute('href', expect.stringContaining('dispute/dispute.do'));
    expect(lastListParams()).toMatchObject({ type: 'CASE', category: 'DEPOSIT_RETURN', size: 3 });

    await user.click(screen.getByRole('button', { name: '모두 접기' }));
    expect(screen.queryByRole('heading', { name: '준비할 자료' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /지금 상황 확인/ }));
    expect(screen.getByRole('heading', { name: '먼저 확인하세요' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '준비할 자료' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '모두 펼치기' }));

    // 문장마다 [근거 보기]로 근거와 적용 조건을 펼치고, 관련 판례 찾기로 판례 탭 검색을 연다.
    await user.click(screen.getAllByRole('button', { name: '근거 보기' })[0]);
    expect(screen.getByText('주택임대차보호법 제6조의2 (묵시적 갱신 시 계약의 해지)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '관련 판례 찾기' }));
    expect(await screen.findByRole('heading', { name: '자료 찾기' })).toBeInTheDocument();
    await waitFor(() => expect(lastListParams()).toMatchObject({ q: '묵시적', type: 'PRECEDENT' }));
  });

  it('나머지 상황도 같은 구조로 안내하고, 상황마다 그 분류의 사례를 가져온다', async () => {
    const topics = [
      ['restore', '원상복구·손해배상', '닳은 것을 두고 다투는 경우', 'DAMAGES'],
      ['repair', '수리 책임', '임차인이 먼저 고치고 비용을 달라는 경우', 'REPAIR_DUTY'],
      ['renewal', '계약 갱신·종료', '내가(가족이) 들어가 살려는 경우', 'RENEWAL_TERMINATION,LEASE_TERM'],
      ['rent', '월세·보증금 조정', '전세를 월세로 바꾸는 경우', 'RENT_ADJUSTMENT'],
      ['other', '기타', '새 임차인 중개보수를 다투는 경우', 'GENERAL,CONTRACT_INTERPRETATION,BROKERAGE_FEE,PREMIUM'],
    ];
    for (const [key, label, caseTitle, category] of topics) {
      const { unmount } = renderAt(`/disputes/topics/${key}`);
      expect(await screen.findByRole('heading', { name: label })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '해결 단계' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '먼저 확인하세요' })).toBeInTheDocument();
      expect(screen.getByText(caseTitle)).toBeInTheDocument();
      expect(lastListParams()).toMatchObject({ type: 'CASE', category, size: 3 });
      unmount();
    }
  });

  it('첫 화면에서 검색하면 자료 찾기 화면에서 그 검색어로 찾는다', async () => {
    const user = userEvent.setup();
    renderAt('/disputes');

    await user.type(screen.getByRole('textbox', { name: '분쟁 질문·사례 검색' }), '도배{Enter}');

    expect(await screen.findByRole('heading', { name: '자료 찾기' })).toBeInTheDocument();
    await waitFor(() => expect(lastListParams()).toMatchObject({ q: '도배' }));
  });
});

describe('상황 안내 단계', () => {
  it('상황마다 서식·도구와 도움받을 곳, 준비 자료·사례·판례가 빠짐없이 한 단계씩에만 들어간다', () => {
    for (const [key, { guide }] of Object.entries(TOPIC_BRIEFINGS)) {
      const used = (field) => guide.procedure.flatMap((step) => step[field] ?? []);
      expect(used('tools').sort(), key).toEqual(guide.tools.map((tool) => tool.key).sort());
      expect(used('help').sort(), key).toEqual(HELP_ROUTES.map((route) => route.key).sort());
      expect(used('parts').sort(), key).toEqual(['caseRefs', 'documents', 'precedents']);
    }
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

describe('splitSections 상담사례', () => {
  it('[질의] [답변]을 "질문" "답변" 카드로 나눈다', () => {
    expect(splitSections('[질의] 보증금에서 빼도 되나요?\n[답변] 통상 손모는 뺄 수 없다.', 'GUIDELINE')).toEqual([
      { title: '질문', body: '보증금에서 빼도 되나요?' },
      { title: '답변', body: '통상 손모는 뺄 수 없다.' },
    ]);
  });
});

describe('breakNumberedItems', () => {
  it('[1] [2] 번호 앞에서 줄을 바꾸고, 맨 앞 번호는 그대로 둔다', () => {
    expect(breakNumberedItems('[1] 가 [2] 나  [3] 다')).toBe('[1] 가\n[2] 나\n[3] 다');
  });
});
