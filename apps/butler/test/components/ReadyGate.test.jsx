// 메뉴를 옮길 때 새 화면이 데이터까지 준비된 뒤 한 번에 바뀌는지.
// 실패 조건: 준비되기 전에 새 화면(로딩 표시 포함)이 보임 · 준비 중 옛 화면이 사라짐 · 같은 묶음 이동이 기다림 · 오래 걸려도 영영 안 바뀜.
import { useQuery } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ReadyGate } from '../../src/landlord/web/components/ReadyGate/ReadyGate';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const Page = ({ name, fetcher }) => {
  const query = useQuery({ queryKey: ['page', name], queryFn: fetcher });
  return <p>{query.data ? `${name} 준비됨` : `${name} 불러오는 중`}</p>;
};

const setup = (fetchers) => {
  let navigate;
  const Probe = () => {
    navigate = useNavigate();
    return null;
  };
  const Gated = () => {
    const location = useLocation();
    const group = location.pathname.startsWith('/logs') ? 'logs' : location.pathname;
    return (
      <ReadyGate location={location} group={group}>
        <Routes>
          <Route path="/home" element={<Page name="home" fetcher={fetchers.home} />} />
          <Route path="/contracts" element={<Page name="contracts" fetcher={fetchers.contracts} />} />
          <Route path="/logs" element={<Page name="logs" fetcher={fetchers.logs} />} />
          <Route path="/logs/new" element={<Page name="logs" fetcher={fetchers.logs} />} />
        </Routes>
      </ReadyGate>
    );
  };
  render(
    <MemoryRouter initialEntries={['/home']}>
      <Probe />
      <Gated />
    </MemoryRouter>,
  );
  return { go: (path) => act(() => navigate(path)) };
};

describe('ReadyGate', () => {
  it('새 화면이 준비될 때까지 옛 화면을 두고, 준비되면 로딩 표시 없이 한 번에 바꾼다', async () => {
    const slow = deferred();
    const { go } = setup({ home: () => Promise.resolve('h'), contracts: () => slow.promise });
    expect(await screen.findByText('home 준비됨')).toBeVisible();

    go('/contracts');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.getByText('home 준비됨')).toBeVisible();
    expect(screen.queryByText('contracts 불러오는 중')).not.toBeVisible(); // 준비 중 새 화면은 숨겨져 있다

    await act(async () => slow.resolve('c'));
    await waitFor(() => expect(screen.getByText('contracts 준비됨')).toBeVisible());
    expect(screen.queryByText('home 준비됨')).not.toBeInTheDocument();
    expect(screen.queryByText('contracts 불러오는 중')).not.toBeInTheDocument();
  });

  it('같은 묶음의 이동(팝업·패널)은 기다리지 않고 그 화면이 그대로 갱신된다', async () => {
    const fetchers = { home: () => Promise.resolve('h'), logs: vi.fn(() => Promise.resolve('l')) };
    const { go } = setup(fetchers);
    go('/logs');
    await waitFor(() => expect(screen.getByText('logs 준비됨')).toBeVisible());

    go('/logs/new');
    expect(screen.getByText('logs 준비됨')).toBeVisible();
    expect(fetchers.logs).toHaveBeenCalledTimes(1);
  });

  it('너무 오래 걸리면 기다리다 그대로 바꾼다(그때는 화면의 로딩 표시가 보인다)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { go } = setup({ home: () => Promise.resolve('h'), contracts: () => new Promise(() => {}) });
      await screen.findByText('home 준비됨');
      go('/contracts');
      await act(async () => vi.advanceTimersByTime(3100));
      await waitFor(() => expect(screen.getByText('contracts 불러오는 중')).toBeVisible());
      expect(screen.queryByText('home 준비됨')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
