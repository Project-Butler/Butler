// 공용 대화 훅(shared/threads/useThreadConversation) — 폴링·읽음·보내기·목록 무효화·isActive(docs/19 10-1, 10-5).
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThreadConversation } from '../../../src/shared/threads/useThreadConversation';

const api = vi.hoisted(() => ({
  getThread: vi.fn(),
  getThreadMessageList: vi.fn(),
  postThreadMessage: vi.fn(),
  postThreadRead: vi.fn(),
  queryKey: { THREADS: 'threads' },
}));
vi.mock('@butler/api-client', () => api);

const apiError = (status, code, message = '오류') =>
  Object.assign(new Error(message), { response: { status, data: { error: { code, message } } } });

const msg = (id, overrides = {}) => ({ id, body: `본문 ${id}`, sender: { id: 'tenant-1' }, attachments: [], isHidden: false, sentAt: '2026-11-26T05:00:00Z', ...overrides });
const page = (data, meta = {}) => ({ data, meta: { nextCursor: null, hasNext: false, ...meta } });

// 폴링 간격은 짧게(실제 10초 대신 40ms) — 진짜 타이머로 돌린다(waitFor 가 setInterval 을 쓴다).
const POLL_MS = 40;
let latest;
const Probe = ({ threadId = 't1', options }) => {
  latest = useThreadConversation(threadId, { pollIntervalMs: POLL_MS, ...options });
  return null;
};

let client;
const renderHook = (props = {}) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(client, 'invalidateQueries');
  const utils = render(
    <QueryClientProvider client={client}>
      <Probe {...props} />
    </QueryClientProvider>,
  );
  return {
    ...utils,
    rerender: (next = {}) =>
      utils.rerender(
        <QueryClientProvider client={client}>
          <Probe {...props} {...next} />
        </QueryClientProvider>,
      ),
  };
};

const setHidden = (value) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
// 폴링 몇 번이 지나갈 만큼 기다린다.
const tick = async (ms = POLL_MS * 3) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

beforeEach(() => {
  setHidden(false);
  api.getThread.mockResolvedValue({ id: 't1', isReadOnly: false, participants: [] });
  // 최신순으로 온다(cursor 방식) → 훅이 뒤집는다
  api.getThreadMessageList.mockImplementation(async (_id, params) => (params.after ? page([]) : page([msg('m3'), msg('m2'), msg('m1')])));
  api.postThreadRead.mockResolvedValue({});
  api.postThreadMessage.mockImplementation(async (_id, body) => msg('sent', { body: body.body, sender: { id: 'landlord-1' } }));
});

afterEach(() => {
  vi.clearAllMocks();
  latest = undefined;
});

const threadsInvalidations = () => client.invalidateQueries.mock.calls.filter(([filters]) => filters?.queryKey?.[0] === 'threads').length;

describe('처음 불러오기 · 읽음', () => {
  it('최신 30개를 오래된 것 → 최신 순으로 두고, 마지막 메시지까지 한 번 읽음 처리한다', async () => {
    renderHook();
    await waitFor(() => expect(latest.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']));
    expect(api.getThreadMessageList).toHaveBeenCalledWith('t1', { size: 30 });
    await waitFor(() => expect(api.postThreadRead).toHaveBeenCalledWith('t1', 'm3'));
    expect(api.postThreadRead).toHaveBeenCalledTimes(1);
  });

  it('읽음이 성공하면 대화 목록(threads)을 무효화한다', async () => {
    renderHook();
    await waitFor(() => expect(threadsInvalidations()).toBe(1));
  });

  it('401이면 onUnauthorized 를 부르고 오류는 두지 않는다', async () => {
    const onUnauthorized = vi.fn();
    api.getThread.mockRejectedValue(apiError(401, 'UNAUTHORIZED'));
    renderHook({ options: { onUnauthorized } });
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
    expect(latest.error).toBeNull();
  });
});

describe('새 메시지 폴링', () => {
  it('처음부터 켜져 있으면 첫 폴링은 간격 뒤(바로 받지 않음), after 로 이어 받고 겹친 메시지는 뺀다', async () => {
    api.getThreadMessageList.mockImplementation(async (_id, params) => (params.after ? page([msg('m3'), msg('m4')]) : page([msg('m3'), msg('m2'), msg('m1')])));
    renderHook({ options: { pollIntervalMs: 300 } });
    await waitFor(() => expect(latest.messages).toHaveLength(3));
    // 처음 불러온 직후에는 폴링하지 않는다(지금 동작 그대로)
    expect(api.getThreadMessageList).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(latest.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']));
    expect(api.getThreadMessageList).toHaveBeenCalledWith('t1', { after: 'm3', size: 100 });
    await waitFor(() => expect(api.postThreadRead).toHaveBeenLastCalledWith('t1', 'm4'));
  });

  it('창이 가려져 있으면 건너뛴다', async () => {
    renderHook();
    setHidden(true);
    await waitFor(() => expect(latest.messages).toHaveLength(3));
    await tick();
    expect(api.getThreadMessageList).toHaveBeenCalledTimes(1);
  });
});

describe('보내기', () => {
  it('글만이면 지금처럼 { body } 를 보내고, 성공하면 목록을 무효화한다', async () => {
    renderHook();
    await waitFor(() => expect(latest.thread).not.toBeNull());
    await waitFor(() => expect(threadsInvalidations()).toBe(1));
    let ok;
    await act(async () => {
      ok = await latest.sendMessage('안녕하세요');
    });
    expect(ok).toBe(true);
    expect(api.postThreadMessage).toHaveBeenCalledWith('t1', { body: '안녕하세요' });
    expect(latest.messages.at(-1).id).toBe('sent');
    expect(threadsInvalidations()).toBeGreaterThanOrEqual(2);
  });

  it('객체로 주면 attachmentDocumentIds 를 같이 보낸다(첨부만이면 빈 글)', async () => {
    renderHook();
    await waitFor(() => expect(latest.thread).not.toBeNull());
    await act(async () => {
      await latest.sendMessage({ body: '', attachmentDocumentIds: ['d1', 'd2'] });
    });
    expect(api.postThreadMessage).toHaveBeenCalledWith('t1', { body: '', attachmentDocumentIds: ['d1', 'd2'] });
  });

  it('보내는 중에 다시 보내면 무시한다', async () => {
    let resolve;
    api.postThreadMessage.mockImplementation(() => new Promise((r) => (resolve = r)));
    renderHook();
    await waitFor(() => expect(latest.thread).not.toBeNull());
    let first;
    let second;
    await act(async () => {
      first = latest.sendMessage('하나');
      second = await latest.sendMessage('둘');
    });
    expect(second).toBe(false);
    await act(async () => {
      resolve(msg('sent'));
      await first;
    });
    expect(api.postThreadMessage).toHaveBeenCalledTimes(1);
  });

  it('THREAD_READ_ONLY 면 그 자리에서 읽기 전용으로 바꾸고 false', async () => {
    api.postThreadMessage.mockRejectedValue(apiError(409, 'THREAD_READ_ONLY', '끝난 대화예요'));
    renderHook();
    await waitFor(() => expect(latest.thread).not.toBeNull());
    let ok;
    await act(async () => {
      ok = await latest.sendMessage('안녕하세요');
    });
    expect(ok).toBe(false);
    expect(latest.thread.isReadOnly).toBe(true);
    expect(latest.sendError.code).toBe('THREAD_READ_ONLY');
  });
});

describe('isActive (PC 팝업 접기)', () => {
  it('처음부터 false(접힌 채 복원)면 처음 불러오기는 하지만 읽음·폴링은 없다', async () => {
    renderHook({ options: { isActive: false } });
    await waitFor(() => expect(latest.messages).toHaveLength(3));
    await tick();
    expect(api.getThreadMessageList).toHaveBeenCalledTimes(1);
    expect(api.postThreadRead).not.toHaveBeenCalled();
  });

  it('false → true(펼치기)면 간격을 기다리지 않고 곧바로 한 번 받고 마지막 메시지까지 읽음', async () => {
    const { rerender } = renderHook({ options: { isActive: false, pollIntervalMs: 5000 } });
    await waitFor(() => expect(latest.messages).toHaveLength(3));
    api.getThreadMessageList.mockImplementation(async (_id, params) => (params.after ? page([msg('m4')]) : page([])));

    rerender({ options: { isActive: true, pollIntervalMs: 5000 } });
    await waitFor(() => expect(api.getThreadMessageList).toHaveBeenLastCalledWith('t1', { after: 'm3', size: 100 }));
    await waitFor(() => expect(api.postThreadRead).toHaveBeenCalledWith('t1', 'm4'));
    expect(api.postThreadRead).toHaveBeenCalledTimes(1);
  });

  it('true → false(접기)면 폴링이 멈추고, 그동안 읽음을 보내지 않는다', async () => {
    const { rerender } = renderHook({ options: { pollIntervalMs: 300 } });
    await waitFor(() => expect(api.postThreadRead).toHaveBeenCalledTimes(1));
    rerender({ options: { pollIntervalMs: 300, isActive: false } });
    api.getThreadMessageList.mockImplementation(async (_id, params) => (params.after ? page([msg('m9')]) : page([])));
    await tick(700);
    expect(api.getThreadMessageList).toHaveBeenCalledTimes(1);
    expect(api.postThreadRead).toHaveBeenCalledTimes(1);
  });

  it('펼친 뒤 마지막 메시지가 그대로면 읽음을 다시 보내지 않는다', async () => {
    const { rerender } = renderHook({ options: { pollIntervalMs: 5000 } });
    await waitFor(() => expect(api.postThreadRead).toHaveBeenCalledTimes(1));
    rerender({ options: { pollIntervalMs: 5000, isActive: false } });
    rerender({ options: { pollIntervalMs: 5000, isActive: true } });
    await waitFor(() => expect(api.getThreadMessageList).toHaveBeenCalledTimes(2));
    expect(api.postThreadRead).toHaveBeenCalledTimes(1);
  });

  it('빠르게 펼침 → 접음 → 펼침이어도 따라잡기는 겹쳐 돌지 않고, 끝난 뒤 마지막 메시지로 읽음 1번', async () => {
    const { rerender } = renderHook({ options: { isActive: false, pollIntervalMs: 5000 } });
    await waitFor(() => expect(latest.messages).toHaveLength(3));
    let release;
    api.getThreadMessageList.mockImplementation(
      (_id, params) =>
        new Promise((resolve) => {
          release = () => resolve(params.after ? page([msg('m4'), msg('m5')]) : page([]));
        }),
    );

    rerender({ options: { isActive: true, pollIntervalMs: 5000 } });
    rerender({ options: { isActive: false, pollIntervalMs: 5000 } });
    rerender({ options: { isActive: true, pollIntervalMs: 5000 } });
    // 첫 따라잡기 요청 하나만 나간다
    expect(api.getThreadMessageList).toHaveBeenCalledTimes(2);
    expect(api.postThreadRead).not.toHaveBeenCalled();

    api.getThreadMessageList.mockImplementation(async () => page([]));
    await act(async () => release());
    await waitFor(() => expect(api.postThreadRead).toHaveBeenCalled());
    await tick(100);
    expect(api.postThreadRead).toHaveBeenCalledTimes(1);
  });

  it('따라잡기가 여러 쪽(hasNext)이어도 끝까지 받은 뒤 마지막 id 로 읽음 1번', async () => {
    const { rerender } = renderHook({ options: { isActive: false, pollIntervalMs: 5000 } });
    await waitFor(() => expect(latest.messages).toHaveLength(3));
    api.getThreadMessageList.mockImplementation(async (_id, params) => {
      if (params.after === 'm3') return page([msg('m4')], { hasNext: true });
      if (params.after === 'm4') return page([msg('m5')]);
      return page([]);
    });
    rerender({ options: { isActive: true, pollIntervalMs: 5000 } });
    await waitFor(() => expect(api.postThreadRead).toHaveBeenCalledWith('t1', 'm5'));
    expect(api.postThreadRead).toHaveBeenCalledTimes(1);
  });
});
