import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisputeChatPage } from '../src/pages/DisputeChatPage';

const api = vi.hoisted(() => ({
  getDisputeChatList: vi.fn(),
  getDisputeChat: vi.fn(),
  postDisputeChat: vi.fn(),
  postDisputeChatMessage: vi.fn(),
  deleteDisputeChat: vi.fn(),
}));

vi.mock('@butler/api-client', () => ({
  ...api,
  queryKey: { DISPUTE_CHATS: 'dispute_chats', DISPUTE_CHAT_DETAIL: 'dispute_chat' },
}));

const REFERENCE = {
  id: 'ref-1',
  type: 'CASE',
  title: '임대차보증금 반환 시기',
  sourceTitle: '2025 주택·상가건물 임대차분쟁 조정사례집 (한국부동산원)',
  sourcePage: 42,
};

const CREATED_CHAT = {
  id: 'chat-1',
  title: '세입자가 이사를 안 나가요',
  createdAt: '2026-10-20T09:30:00Z',
  updatedAt: '2026-10-20T09:30:05Z',
  messages: [
    { id: 'm1', role: 'USER', content: '세입자가 이사를 안 나가요', references: [], createdAt: '2026-10-20T09:30:00Z' },
    {
      id: 'm2',
      role: 'ASSISTANT',
      content: '### 쟁점\n보증금 반환과 주택 인도는 **동시이행 관계**입니다[1].',
      references: [REFERENCE],
      createdAt: '2026-10-20T09:30:05Z',
    },
  ],
};

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DisputeChatPage />
    </QueryClientProvider>,
  );
};

describe('DisputeChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getDisputeChatList.mockResolvedValue({ data: [], meta: { page: 1, size: 50, total: 0, hasNext: false } });
  });

  it('처음 들어오면 법률 자문이 아니라는 안내와 예시 질문을 보여준다', async () => {
    renderPage();

    expect(screen.getByText('AI 도움 · 법률 자문 아님')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계약이 끝났는데 세입자가 이사를 안 나가요.' })).toBeInTheDocument();
    expect(await screen.findByText('아직 상담 기록이 없어요.')).toBeInTheDocument();
  });

  it('질문을 보내면 답변을 마크다운으로 보여주고, [1]을 근거 자료와 연결한다', async () => {
    const user = userEvent.setup();
    let resolveAnswer;
    api.postDisputeChat.mockReturnValue(new Promise((resolve) => (resolveAnswer = resolve)));
    api.getDisputeChat.mockResolvedValue(CREATED_CHAT);
    renderPage();

    await user.type(screen.getByLabelText('상담 질문'), '세입자가 이사를 안 나가요');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    // 답변을 기다리는 동안: 질문을 먼저 보여주고, 보내기 버튼을 막는다.
    expect(screen.getByText(/비슷한 사례를 찾고 답변을 쓰고 있어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '답변 작성 중' })).toBeDisabled();
    // React Query는 mutationFn에 두 번째 인자(context)를 넘기므로 첫 인자만 본다.
    expect(api.postDisputeChat.mock.calls[0][0]).toEqual({ message: '세입자가 이사를 안 나가요' });

    resolveAnswer(CREATED_CHAT);

    const citation = await screen.findByRole('link', { name: '근거 자료 1' });
    expect(citation).toHaveAttribute('href', '#ref-m2-1');
    expect(screen.getByText('동시이행 관계').tagName).toBe('STRONG');
    expect(screen.getByText('쟁점')).toBeInTheDocument();

    const referenceItem = document.getElementById('ref-m2-1');
    expect(within(referenceItem).getByText('임대차보증금 반환 시기')).toBeInTheDocument();
    expect(within(referenceItem).getByText('분쟁조정 사례')).toBeInTheDocument();
  });

  it('질문을 보내는 즉시 상담 목록에 나타나고, 답변이 오면 실제 대화로 바뀐다', async () => {
    const user = userEvent.setup();
    let resolveAnswer;
    api.postDisputeChat.mockReturnValue(new Promise((resolve) => (resolveAnswer = resolve)));
    api.getDisputeChat.mockResolvedValue(CREATED_CHAT);
    renderPage();
    await screen.findByText('아직 상담 기록이 없어요.');

    await user.type(screen.getByLabelText('상담 질문'), '세입자가 이사를 안 나가요');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    const sidebar = screen.getByRole('complementary');
    expect(within(sidebar).getByText('세입자가 이사를 안 나가요')).toBeInTheDocument();
    expect(within(sidebar).getByText('답변 기다리는 중…')).toBeInTheDocument();

    // 답변 뒤 다시 불러온 서버 목록에는 새 대화가 들어 있다.
    const { messages: _messages, ...summary } = CREATED_CHAT;
    api.getDisputeChatList.mockResolvedValue({ data: [summary], meta: { page: 1, size: 50, total: 1, hasNext: false } });
    resolveAnswer(CREATED_CHAT);

    expect(await within(sidebar).findByRole('button', { current: true })).toHaveTextContent('세입자가 이사를 안 나가요');
    expect(within(sidebar).queryByText('답변 기다리는 중…')).not.toBeInTheDocument();
  });

  it('답변을 받지 못하면 서버가 준 오류 문구를 보여주고, 질문을 입력창에 되돌린다', async () => {
    const user = userEvent.setup();
    api.postDisputeChat.mockRejectedValue({
      response: { data: { error: { code: 'EXTERNAL_SERVICE_UNAVAILABLE', message: '상담 챗봇 사용량이 많습니다. 잠시 후 다시 시도해주세요.' } } },
    });
    renderPage();

    await user.type(screen.getByLabelText('상담 질문'), '월세를 올려도 되나요');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('상담 챗봇 사용량이 많습니다. 잠시 후 다시 시도해주세요.');
    expect(screen.getByLabelText('상담 질문')).toHaveValue('월세를 올려도 되나요');
    expect(screen.queryByText('EXTERNAL_SERVICE_UNAVAILABLE')).not.toBeInTheDocument();
  });

  it('Enter로 보내고, Shift+Enter는 줄바꿈만 한다', async () => {
    const user = userEvent.setup();
    api.postDisputeChat.mockResolvedValue(CREATED_CHAT);
    api.getDisputeChat.mockResolvedValue(CREATED_CHAT);
    renderPage();

    const input = screen.getByLabelText('상담 질문');
    await user.type(input, '첫 줄{Shift>}{Enter}{/Shift}둘째 줄');
    expect(api.postDisputeChat).not.toHaveBeenCalled();
    expect(input).toHaveValue('첫 줄\n둘째 줄');

    await user.type(input, '{Enter}');
    expect(api.postDisputeChat.mock.calls[0][0]).toEqual({ message: '첫 줄\n둘째 줄' });
  });
});
