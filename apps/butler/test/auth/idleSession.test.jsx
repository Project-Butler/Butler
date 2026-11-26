// 세션 수명 규칙(#247): 30분 무조작 로그아웃, 열린 탭이 없을 때만 새 방문으로 보고 로그인부터, 탭 간 로그인·로그아웃 동기화.
// 시간은 vi 가짜 타이머로 흘리고, 다른 탭은 같은 localStorage·BroadcastChannel 을 쓰는 가짜로 만든다.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ postLogout: vi.fn() }));
vi.mock('@butler/api-client', () => api);

const MIN = 60 * 1000;
const START = new Date('2026-11-26T09:00:00+09:00').getTime();

// 같은 이름의 채널끼리 메시지를 주고받는 최소 BroadcastChannel (보낸 인스턴스에는 돌려주지 않는다: 실제 동작과 같다)
const channels = [];
class FakeChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    this.closed = false;
    channels.push(this);
  }
  postMessage(data) {
    channels.filter((c) => c !== this && c.name === this.name && !c.closed).forEach((c) => c.onmessage?.({ data }));
  }
  close() {
    this.closed = true;
  }
}
// 이 테스트 파일 안의 "다른 탭"이 보내는 메시지
const otherTab = () => new FakeChannel('butler-session');

let mod;
const load = async () => {
  vi.resetModules();
  mod = await import('../../src/auth/idleSession');
};

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  vi.clearAllMocks();
  api.postLogout.mockResolvedValue();
  localStorage.clear();
  sessionStorage.clear();
  channels.length = 0;
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  await load();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const setStored = (key, msAgo) => localStorage.setItem(key, String(Date.now() - msAgo));

describe('prepareSession: 열려 있는 탭이 없을 때만 새 방문으로 본다', () => {
  it('열린 탭 기록이 아예 없으면(처음, 모든 창을 닫았다 옴) 남은 세션을 서버에서 끊는다', async () => {
    await mod.prepareSession();
    expect(api.postLogout).toHaveBeenCalledTimes(1);
  });

  it('다른 탭이 5초 전에 살아 있음을 알렸으면 로그아웃하지 않는다 (새 탭은 로그인이 이어진다)', async () => {
    setStored(mod.ALIVE_KEY, 5 * 1000);
    setStored(mod.ACTIVE_KEY, 2 * MIN);
    await mod.prepareSession();
    expect(api.postLogout).not.toHaveBeenCalled();
  });

  it('마지막 알림이 14초 전이면 아직 열린 탭이고, 15초 전이면 닫힌 탭이다 (경계)', async () => {
    setStored(mod.ALIVE_KEY, 14 * 1000);
    await mod.prepareSession();
    expect(api.postLogout).not.toHaveBeenCalled();

    await load();
    localStorage.clear();
    sessionStorage.clear(); // 새 창
    setStored(mod.ALIVE_KEY, 15 * 1000);
    await mod.prepareSession();
    expect(api.postLogout).toHaveBeenCalledTimes(1);
  });

  it('탭이 열려 있어도 마지막 조작이 30분 넘게 지났으면 끊는다 (29분 59초는 유지)', async () => {
    setStored(mod.ALIVE_KEY, 1000);
    setStored(mod.ACTIVE_KEY, 30 * MIN - 1000);
    await mod.prepareSession();
    expect(api.postLogout).not.toHaveBeenCalled();

    await load();
    setStored(mod.ALIVE_KEY, 1000);
    setStored(mod.ACTIVE_KEY, 30 * MIN);
    await mod.prepareSession();
    expect(api.postLogout).toHaveBeenCalledTimes(1);
  });

  it('같은 탭이 새로고침되거나 다른 사이트(소셜 로그인)에 갔다 오면, 열린 탭 기록이 끊겼어도 로그아웃하지 않는다', async () => {
    await mod.prepareSession(); // 이 탭의 첫 방문: 탭 표식이 남는다
    api.postLogout.mockClear();
    localStorage.removeItem(mod.ALIVE_KEY); // 소셜 로그인 화면에 있는 동안 갱신이 끊겼다
    await load();
    await mod.prepareSession();
    expect(api.postLogout).not.toHaveBeenCalled();
  });

  it('창을 모두 닫았다 오면(탭 표식도 사라짐) 지난 방문의 마지막 조작 시각도 지운다 (새 로그인이 옛 시각 때문에 끊기지 않게)', async () => {
    setStored(mod.ACTIVE_KEY, 5 * 60 * MIN);
    await mod.prepareSession();
    expect(localStorage.getItem(mod.ACTIVE_KEY)).toBeNull();
  });

  it('같은 탭이어도 마지막 조작이 30분 넘게 지났으면 끊는다 (브라우저가 탭을 복원한 경우)', async () => {
    await mod.prepareSession();
    api.postLogout.mockClear();
    setStored(mod.ACTIVE_KEY, 31 * MIN);
    await load();
    await mod.prepareSession();
    expect(api.postLogout).toHaveBeenCalledTimes(1);
  });

  it('판단하자마자 이 탭도 열린 탭으로 기록한다 (동시에 열린 다음 탭이 이 탭을 보고 끊지 않는다)', async () => {
    await mod.prepareSession();
    expect(Date.now() - Number(localStorage.getItem(mod.ALIVE_KEY))).toBeLessThan(1000);
    api.postLogout.mockClear();
    await load();
    await mod.prepareSession();
    expect(api.postLogout).not.toHaveBeenCalled();
  });

  it('페이지 로드당 한 번만 판단한다 (개발 모드에서 effect 가 두 번 돌아도 로그아웃은 한 번)', async () => {
    const first = mod.prepareSession();
    const second = mod.prepareSession();
    expect(second).toBe(first);
    await first;
    expect(api.postLogout).toHaveBeenCalledTimes(1);
  });

  it('서버 로그아웃이 실패해도 예외를 밖으로 던지지 않는다 (뒤따르는 세션 확인이 판단한다)', async () => {
    api.postLogout.mockRejectedValue(new Error('network'));
    await expect(mod.prepareSession()).resolves.toBeUndefined();
  });

  it('저장소를 못 쓰는 환경에서도 예외 없이 끝난다', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    await expect(mod.prepareSession()).resolves.toBeUndefined();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe('useTabHeartbeat', () => {
  it('처음 한 번, 이후 5초마다 열린 탭 시각을 갱신한다', () => {
    renderHook(() => mod.useTabHeartbeat());
    const first = Number(localStorage.getItem(mod.ALIVE_KEY));
    expect(first).toBe(Date.now());

    vi.advanceTimersByTime(4999);
    expect(Number(localStorage.getItem(mod.ALIVE_KEY))).toBe(first);
    vi.advanceTimersByTime(1);
    expect(Number(localStorage.getItem(mod.ALIVE_KEY))).toBe(first + 5000);
    vi.advanceTimersByTime(5000);
    expect(Number(localStorage.getItem(mod.ALIVE_KEY))).toBe(first + 10000);
  });

  it('탭이 닫히면(언마운트) 갱신을 멈춘다', () => {
    const { unmount } = renderHook(() => mod.useTabHeartbeat());
    unmount();
    const stopped = localStorage.getItem(mod.ALIVE_KEY);
    vi.advanceTimersByTime(60 * 1000);
    expect(localStorage.getItem(mod.ALIVE_KEY)).toBe(stopped);
  });
});

describe('useIdleLogout: 30분 무조작', () => {
  const setup = (loggedIn = true) => {
    const onIdle = vi.fn();
    const view = renderHook(({ on }) => mod.useIdleLogout(on, onIdle), { initialProps: { on: loggedIn } });
    return { onIdle, ...view };
  };

  it('29분 59초까지는 로그아웃하지 않고, 30분이 되면 한다', () => {
    const { onIdle } = setup();
    vi.advanceTimersByTime(29 * MIN + 30 * 1000);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30 * 1000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('조작(클릭·키·스크롤 등)하면 30분이 다시 시작된다', () => {
    const { onIdle } = setup();
    vi.advanceTimersByTime(20 * MIN);
    act(() => { window.dispatchEvent(new Event('pointerdown')); });
    vi.advanceTimersByTime(20 * MIN);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10 * MIN);
    expect(onIdle).toHaveBeenCalled();
  });

  it.each(['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'])('%s 도 조작으로 센다', (name) => {
    const { onIdle } = setup();
    vi.advanceTimersByTime(25 * MIN);
    act(() => { window.dispatchEvent(new Event(name)); });
    vi.advanceTimersByTime(25 * MIN);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('조작 기록은 5초에 한 번만 쓴다 (mousemove 류가 저장소를 두드리지 않게)', () => {
    setup();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    for (let i = 0; i < 50; i += 1) act(() => { window.dispatchEvent(new Event('pointerdown')); });
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    act(() => { window.dispatchEvent(new Event('pointerdown')); });
    expect(setItem).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });

  it('다른 탭에서 조작한 것도 센다 (마지막 조작 시각을 탭끼리 공유)', () => {
    const { onIdle } = setup();
    vi.advanceTimersByTime(25 * MIN);
    localStorage.setItem(mod.ACTIVE_KEY, String(Date.now())); // 다른 탭의 조작
    vi.advanceTimersByTime(25 * MIN);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5 * MIN);
    expect(onIdle).toHaveBeenCalled();
  });

  it('로그인 전에는 아무것도 하지 않는다 (타이머·기록 없음)', () => {
    const { onIdle } = setup(false);
    vi.advanceTimersByTime(60 * MIN);
    expect(onIdle).not.toHaveBeenCalled();
    expect(localStorage.getItem(mod.ACTIVE_KEY)).toBeNull();
  });

  it('로그인하는 순간부터 센다 (이전 방문의 오래된 조작 시각으로 곧바로 끊기지 않는다)', () => {
    setStored(mod.ACTIVE_KEY, 3 * 60 * MIN);
    const { onIdle, rerender } = setup(false);
    rerender({ on: true });
    vi.advanceTimersByTime(MIN);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('로그아웃하면 마지막 조작 시각을 지운다 (다음 로그인·소셜 로그인 복귀가 옛 시각으로 끊기지 않게)', () => {
    const { rerender } = setup(true);
    expect(localStorage.getItem(mod.ACTIVE_KEY)).not.toBeNull();
    rerender({ on: false });
    expect(localStorage.getItem(mod.ACTIVE_KEY)).toBeNull();
  });

  it('로그아웃하면 점검을 멈춘다', () => {
    const { onIdle, rerender } = setup(true);
    rerender({ on: false });
    vi.advanceTimersByTime(60 * MIN);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('백그라운드에서 타이머가 늦어도, 탭이 다시 보이는 순간 바로 로그아웃한다', () => {
    const { onIdle } = setup();
    vi.setSystemTime(Date.now() + 40 * MIN); // 타이머는 안 돌고 시계만 흘렀다
    expect(onIdle).not.toHaveBeenCalled();
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('언마운트하면 이벤트 리스너를 거둔다', () => {
    const { onIdle, unmount } = setup();
    const remove = vi.spyOn(window, 'removeEventListener');
    unmount();
    expect(remove.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining(['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']));
    vi.advanceTimersByTime(60 * MIN);
    expect(onIdle).not.toHaveBeenCalled();
    remove.mockRestore();
  });

  it('onIdle 이 끝나기 전(서버 응답 대기 중)에는 점검이 와도 다시 부르지 않는다. 끝난 뒤 아직 로그인 중이면 다시 시도한다', async () => {
    let finish;
    const onIdle = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    renderHook(() => mod.useIdleLogout(true, onIdle));
    vi.advanceTimersByTime(30 * MIN);
    expect(onIdle).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5 * MIN); // 점검 10번이 더 지나도
    expect(onIdle).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    vi.advanceTimersByTime(30 * 1000);
    expect(onIdle).toHaveBeenCalledTimes(2);
  });

  it('onIdle 이 바뀌어도 점검을 다시 시작하지 않는다 (최신 onIdle 을 부른다)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => mod.useIdleLogout(true, cb), { initialProps: { cb: first } });
    vi.advanceTimersByTime(20 * MIN);
    rerender({ cb: second });
    vi.advanceTimersByTime(10 * MIN);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });
});

describe('useSessionSync: 탭 간 로그인·로그아웃', () => {
  const USER = { id: 'u-1' };
  const setup = (user) => {
    const handlers = { onRemoteLogout: vi.fn(), onRemoteLogin: vi.fn() };
    const view = renderHook(({ u }) => mod.useSessionSync(u, handlers), { initialProps: { u: user } });
    const other = otherTab();
    const received = [];
    other.onmessage = ({ data }) => received.push(data);
    return { handlers, received, other, ...view };
  };

  it('이 탭이 로그아웃하면 다른 탭에 logout 을 알린다', () => {
    const { received, rerender } = setup(USER);
    expect(received).toEqual([]);
    rerender({ u: null });
    expect(received).toEqual(['logout']);
  });

  it('이 탭이 로그인하면 다른 탭에 login 을 알린다', () => {
    const { received, rerender } = setup(null);
    rerender({ u: USER });
    expect(received).toEqual(['login']);
  });

  it('처음 마운트할 때는 아무것도 알리지 않는다', () => {
    const { received } = setup(USER);
    expect(received).toEqual([]);
  });

  it('다른 탭이 logout 을 알리면 로그인 중인 이 탭은 onRemoteLogout 을 부른다', () => {
    const { handlers, other } = setup(USER);
    other.postMessage('logout');
    expect(handlers.onRemoteLogout).toHaveBeenCalledTimes(1);
    expect(handlers.onRemoteLogin).not.toHaveBeenCalled();
  });

  it('이미 로그아웃된 탭은 logout 알림에 반응하지 않는다', () => {
    const { handlers, other } = setup(null);
    other.postMessage('logout');
    expect(handlers.onRemoteLogout).not.toHaveBeenCalled();
  });

  it('다른 탭이 login 을 알리면 로그아웃 상태인 이 탭은 onRemoteLogin 을 부른다', () => {
    const { handlers, other } = setup(null);
    other.postMessage('login');
    expect(handlers.onRemoteLogin).toHaveBeenCalledTimes(1);
  });

  it('이미 로그인한 탭은 login 알림을 무시한다 (세션을 다시 읽지 않는다)', () => {
    const { handlers, other } = setup(USER);
    other.postMessage('login');
    expect(handlers.onRemoteLogin).not.toHaveBeenCalled();
  });

  it('알림 때문에 바뀐 상태는 다시 알리지 않는다 (왕복 방지)', () => {
    const { received, other, rerender } = setup(USER);
    other.postMessage('logout');
    rerender({ u: null }); // onRemoteLogout 이 세션을 지운 결과
    expect(received).toEqual([]);
  });

  it('알림을 받았지만 상태가 안 바뀌었다면, 한참 뒤 이 탭의 로그인은 평소처럼 알린다', () => {
    const { received, other, rerender } = setup(null);
    other.postMessage('login'); // 세션 확인이 실패해 이 탭은 계속 로그아웃
    vi.advanceTimersByTime(10 * 1000);
    rerender({ u: USER });
    expect(received).toEqual(['login']);
  });

  it('언마운트하면 채널을 닫는다', () => {
    const { handlers, other, unmount } = setup(USER);
    unmount();
    other.postMessage('logout');
    expect(handlers.onRemoteLogout).not.toHaveBeenCalled();
  });

  it('BroadcastChannel 이 없는 브라우저에서도 예외 없이 동작한다', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    expect(() => {
      const { rerender } = renderHook(({ u }) => mod.useSessionSync(u, { onRemoteLogout() {}, onRemoteLogin() {} }), { initialProps: { u: USER } });
      rerender({ u: null });
    }).not.toThrow();
  });
});
