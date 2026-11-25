// 메뉴를 옮겨 다닐 때 본문이 깜빡이지 않는 근거: 한 번 본 화면은 다시 열 때 캐시된 데이터로 바로 그려지고, 첫 방문만 로딩이다.
// 실패 조건: 다시 열 때 isLoading 이 true(= 스켈레톤이 다시 뜸) · data 가 null · 목록 더 보기가 앞 페이지를 잃음 · 401 에 오류 문구가 뜸.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useApiPagedQuery, useApiQuery } from '../../src/shared/useApiQuery';

const makeWrapper = (client) => {
  const Wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return Wrapper;
};
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('useApiQuery', () => {
  it('첫 방문은 로딩 → 데이터, 다시 열면 로딩 없이 캐시 데이터가 바로 나온다', async () => {
    const client = newClient();
    const queryFn = vi.fn().mockResolvedValue({ name: '래미안' });
    const use = () => useApiQuery({ queryKey: ['p', '1'], queryFn });

    const first = renderHook(use, { wrapper: makeWrapper(client) });
    expect(first.result.current).toMatchObject({ data: null, isLoading: true });
    await waitFor(() => expect(first.result.current.data).toEqual({ name: '래미안' }));
    expect(first.result.current.isLoading).toBe(false);
    first.unmount();

    const second = renderHook(use, { wrapper: makeWrapper(client) });
    expect(second.result.current).toMatchObject({ data: { name: '래미안' }, isLoading: false });
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2)); // 뒤에서 새로 받는다
  });

  it('enabled가 false면 호출하지 않고 로딩도 아니다', () => {
    const queryFn = vi.fn();
    const { result } = renderHook(() => useApiQuery({ queryKey: ['p', null], queryFn, enabled: false }), { wrapper: makeWrapper(newClient()) });
    expect(queryFn).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ data: null, error: null, isLoading: false });
  });

  it('오류는 서버 문구로 바꾸고, 401은 오류 대신 onUnauthorized를 부른다', async () => {
    const fail = (status, message) => Object.assign(new Error('x'), { response: { status, data: { error: { code: 'E', message } } } });
    const onUnauthorized = vi.fn();

    const bad = renderHook(() => useApiQuery({ queryKey: ['a'], queryFn: () => Promise.reject(fail(404, '없는 호실이에요')), onUnauthorized }), {
      wrapper: makeWrapper(newClient()),
    });
    await waitFor(() => expect(bad.result.current.error).toMatchObject({ status: 404, message: '없는 호실이에요' }));
    expect(bad.result.current.isLoading).toBe(false);
    expect(onUnauthorized).not.toHaveBeenCalled();

    const unauth = renderHook(() => useApiQuery({ queryKey: ['b'], queryFn: () => Promise.reject(fail(401, '로그인')), onUnauthorized }), {
      wrapper: makeWrapper(newClient()),
    });
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
    expect(unauth.result.current.error).toBeNull();
  });
});

describe('useApiPagedQuery', () => {
  const pages = {
    1: { items: ['a', 'b'], meta: { page: 1, hasNext: true } },
    2: { items: ['c'], meta: { page: 2, hasNext: false } },
  };

  it('page를 올리면 앞 페이지 뒤에 이어 붙이고 meta는 마지막 페이지 것이다', async () => {
    const fetchPage = vi.fn((page) => Promise.resolve(pages[page]));
    const { result, rerender } = renderHook(({ page }) => useApiPagedQuery({ queryKey: ['list', { f: 1 }], fetchPage, page }), {
      initialProps: { page: 1 },
      wrapper: makeWrapper(newClient()),
    });
    expect(result.current).toMatchObject({ data: null, isLoading: true });
    await waitFor(() => expect(result.current.data?.items).toEqual(['a', 'b']));

    rerender({ page: 2 });
    // 다음 페이지를 받는 동안에도 앞 페이지는 그대로 보인다
    expect(result.current.data.items).toEqual(['a', 'b']);
    expect(result.current.isLoading).toBe(true); // [더 보기] 버튼이 "불러오는 중"
    await waitFor(() => expect(result.current.data.items).toEqual(['a', 'b', 'c']));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data.meta.hasNext).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('목록을 다시 열면 캐시로 바로 나오고, 오류 페이지는 refetch로 다시 받는다', async () => {
    const client = newClient();
    const fetchPage = vi.fn().mockRejectedValueOnce(Object.assign(new Error('x'), { response: { status: 500, data: { error: { message: '서버 오류' } } } }));
    fetchPage.mockResolvedValue(pages[1]);
    const use = () => useApiPagedQuery({ queryKey: ['list2'], fetchPage, page: 1 });

    const first = renderHook(use, { wrapper: makeWrapper(client) });
    await waitFor(() => expect(first.result.current.error?.message).toBe('서버 오류'));
    act(() => first.result.current.refetch());
    await waitFor(() => expect(first.result.current.data?.items).toEqual(['a', 'b']));
    first.unmount();

    const second = renderHook(use, { wrapper: makeWrapper(client) });
    expect(second.result.current.data.items).toEqual(['a', 'b']);
    // 뒤에서 새로 받는 중에도 버튼은 "더 보기"로 그대로다(깜빡이지 않음)
    expect(second.result.current.isLoading).toBe(false);
  });
});
