import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@butler/api-client', () => ({
  queryKey: new Proxy({}, { get: (_, name) => String(name) }),
  getNotificationList: vi.fn(),
  postNotificationRead: vi.fn(),
}));

import { getNotificationList, postNotificationRead } from '@butler/api-client';
import { useGetUnreadNotifications } from '../../../../src/landlord/web/hooks/useGetUnreadNotifications';

// react-query 훅이라 테스트마다 새 QueryClient(재시도·캐시 없음)로 감싼다.
const wrapper = ({ children }) => createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }) }, children);
const n = (id) => ({ id, title: `알림 ${id}`, link: `/tickets/${id}`, readAt: null, createdAt: '2026-11-25T03:00:00Z' });

describe('PC 종 안 읽은 알림', () => {
  beforeEach(() => vi.clearAllMocks());

  it('읽음 저장보다 다시 불러오기가 먼저 끝나도 읽은 알림이 다시 보이지 않는다', async () => {
    vi.mocked(getNotificationList).mockResolvedValue({ data: [n('a'), n('b')], meta: {} });
    let finishRead;
    vi.mocked(postNotificationRead).mockReturnValue(new Promise((resolve) => (finishRead = resolve)));
    const { result } = renderHook(() => useGetUnreadNotifications(), { wrapper });
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual(['a', 'b']));

    act(() => {
      result.current.markRead('a');
    });
    // 서버는 아직 a 를 안 읽은 것으로 돌려준다(저장이 끝나기 전)
    act(() => result.current.refetch());
    await waitFor(() => expect(getNotificationList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual(['b']));
    finishRead({});
  });

  it('읽음 저장이 실패하면 그 알림이 다시 안 읽음으로 보인다', async () => {
    vi.mocked(getNotificationList).mockResolvedValue({ data: [n('a')], meta: {} });
    vi.mocked(postNotificationRead).mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useGetUnreadNotifications(), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => {
      await result.current.markRead('a');
    });
    // 저장이 실패했으니 읽은 것으로 기억하지 않는다(다시 보인다).
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual(['a']));
  });
});
