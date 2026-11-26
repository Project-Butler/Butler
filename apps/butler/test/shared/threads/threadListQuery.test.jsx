// 대화 목록 쿼리 한 곳(threadListQuery): 목록 훅과 안 읽은 수 훅이 같은 키·폴링을 쓴다(docs/19 10-1, 11-1).
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THREAD_LIST_POLL_MS, threadListQuery } from '../../../src/shared/threads/threadListQuery';
import { useGetThreadList } from '../../../src/shared/threads/useGetThreadList';
import { useGetThreadUnreadCount } from '../../../src/shared/threads/useGetThreadUnreadCount';

const api = vi.hoisted(() => ({ getThreadList: vi.fn(), queryKey: { THREADS: 'threads' } }));
vi.mock('@butler/api-client', () => api);

const page = (threads) => ({ data: threads, meta: { page: 1, size: 100, total: threads.length, hasNext: false } });
const item = (id, overrides = {}) => ({
  id,
  title: id,
  participants: [],
  lastMessage: null,
  unreadCount: 0,
  isReadOnly: false,
  createdAt: '2026-11-26T00:00:00Z',
  ...overrides,
});

const ListProbe = () => {
  const { items } = useGetThreadList();
  return <output data-testid="list">{items.map((thread) => thread.id).join(',')}</output>;
};
const CountProbe = () => <output data-testid="count">{useGetThreadUnreadCount()}</output>;

const renderWithClient = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
};

beforeEach(() => {
  api.getThreadList.mockResolvedValue(page([item('a', { unreadCount: 2 }), item('old', { isReadOnly: true }), item('b', { unreadCount: 1 })]));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('threadListQuery', () => {
  it('queryFn 은 함수다(그 자리에서 부르지 않는다) — 최근 100개를 받는다', async () => {
    expect(typeof threadListQuery.queryFn).toBe('function');
    expect(api.getThreadList).not.toHaveBeenCalled();
    await threadListQuery.queryFn();
    expect(api.getThreadList).toHaveBeenCalledWith({ size: 100 });
  });

  it('창 복귀 때 다시 받기는 켜고(전역 기본 false), 10초 안이면 받지 않는다', () => {
    expect(threadListQuery.refetchOnWindowFocus).toBe(true);
    expect(threadListQuery.staleTime).toBe(10_000);
    expect(threadListQuery.refetchInterval).toBe(30_000);
  });
});

describe('목록 훅 · 안 읽은 수 훅', () => {
  it('둘을 같이 그려도 요청은 1번, 목록은 읽기 전용을 맨 아래로, 숫자는 안 읽은 대화 수', async () => {
    renderWithClient(
      <>
        <ListProbe />
        <CountProbe />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId('list')).toHaveTextContent('a,b,old'));
    expect(screen.getByTestId('count')).toHaveTextContent('2');
    expect(api.getThreadList).toHaveBeenCalledTimes(1);
  });

  it('안 읽은 수 훅만 떠 있어도 30초마다 다시 받는다', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    renderWithClient(<CountProbe />);
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
    expect(api.getThreadList).toHaveBeenCalledTimes(1);

    api.getThreadList.mockResolvedValue(page([item('a', { unreadCount: 0 })]));
    await act(async () => {
      vi.advanceTimersByTime(THREAD_LIST_POLL_MS);
    });
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'));
    expect(api.getThreadList).toHaveBeenCalledTimes(2);
  });

  it('threads 키를 무효화하면 다시 받는다', async () => {
    const { client } = renderWithClient(<CountProbe />);
    await waitFor(() => expect(api.getThreadList).toHaveBeenCalledTimes(1));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['threads'] });
    });
    expect(api.getThreadList).toHaveBeenCalledTimes(2);
  });

  it('받기 전·실패하면 숫자는 0', async () => {
    api.getThreadList.mockRejectedValue(
      Object.assign(new Error('서버 오류'), { response: { status: 500, data: { error: { code: 'INTERNAL', message: '오류' } } } }),
    );
    renderWithClient(<CountProbe />);
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    await waitFor(() => expect(api.getThreadList).toHaveBeenCalled());
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });
});
