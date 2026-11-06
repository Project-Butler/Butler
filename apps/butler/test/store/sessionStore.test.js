// 세션 스토어(zustand): user, verifiedLegalDongCodes, login, logout, clearSession
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getMe: vi.fn(), postLogout: vi.fn() }));
vi.mock('@butler/api-client', () => api);

const { useSessionStore } = await import('../../src/store/sessionStore');

const LANDLORD = { id: 'u-1', email: 'landlord@butler.test', name: '김집주', role: 'LANDLORD' };
const reset = () => useSessionStore.setState({ user: null, verifiedLegalDongCodes: [], isRestoring: true });
const state = () => useSessionStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  reset();
});

describe('처음 상태', () => {
  it('로그인 전이고, 세션 복원 중이다', () => {
    expect(state().user).toBeNull();
    expect(state().verifiedLegalDongCodes).toEqual([]);
    expect(state().isRestoring).toBe(true);
  });
});

describe('restoreSession: 새로고침해도 로그인이 풀리지 않게 GET /auth/me 로 복원', () => {
  it('성공하면 user·법정동 코드를 채우고 복원을 끝낸다', async () => {
    api.getMe.mockResolvedValue({ user: LANDLORD, verifiedLegalDongCodes: ['1171010100'] });
    await state().restoreSession();
    expect(state().user).toEqual(LANDLORD);
    expect(state().verifiedLegalDongCodes).toEqual(['1171010100']);
    expect(state().isRestoring).toBe(false);
    expect(api.getMe).toHaveBeenCalledTimes(1);
  });

  it('법정동 코드가 응답에 없으면 빈 배열', async () => {
    api.getMe.mockResolvedValue({ user: LANDLORD });
    await state().restoreSession();
    expect(state().verifiedLegalDongCodes).toEqual([]);
  });

  it('401 같은 실패는 로그아웃 상태로 두고 복원을 끝낸다 (예외를 밖으로 던지지 않는다)', async () => {
    api.getMe.mockRejectedValue(Object.assign(new Error('401'), { response: { status: 401 } }));
    await expect(state().restoreSession()).resolves.toBeUndefined();
    expect(state().user).toBeNull();
    expect(state().isRestoring).toBe(false);
  });
});

describe('login / clearSession', () => {
  it('login 은 user·코드를 채우고 복원 중이 아니게 한다 (복원이 끝나기 전에 로그인해도)', () => {
    state().login({ user: LANDLORD, verifiedLegalDongCodes: ['1171010100'] });
    expect(state().user).toEqual(LANDLORD);
    expect(state().verifiedLegalDongCodes).toEqual(['1171010100']);
    expect(state().isRestoring).toBe(false);
  });

  it('login 의 법정동 코드가 없으면 빈 배열', () => {
    state().login({ user: LANDLORD });
    expect(state().verifiedLegalDongCodes).toEqual([]);
  });

  it('clearSession 은 user·코드를 비운다. 복원 중 상태로 되돌리지 않는다', () => {
    state().login({ user: LANDLORD, verifiedLegalDongCodes: ['1171010100'] });
    state().clearSession();
    expect(state().user).toBeNull();
    expect(state().verifiedLegalDongCodes).toEqual([]);
    expect(state().isRestoring).toBe(false);
  });

  it('clearSession 참조는 상태가 바뀌어도 같다 (데이터 훅이 onUnauthorized 를 useEffect 의존성에 넣으므로, 바뀌면 요청이 무한 반복된다)', () => {
    const before = state().clearSession;
    state().login({ user: LANDLORD });
    state().clearSession();
    state().login({ user: LANDLORD });
    expect(state().clearSession).toBe(before);
  });
});

describe('logout', () => {
  it('서버 로그아웃 → onLoggedOut(이동) → 세션 삭제 순서로 한다. 이동이 먼저여야 다음 로그인이 이전 경로로 돌아가지 않는다', async () => {
    state().login({ user: LANDLORD });
    const order = [];
    api.postLogout.mockImplementation(async () => order.push('postLogout'));
    await state().logout(() => order.push(`onLoggedOut(user=${state().user ? 'still' : 'none'})`));
    order.push(`after(user=${state().user ? 'still' : 'none'})`);
    expect(order).toEqual(['postLogout', 'onLoggedOut(user=still)', 'after(user=none)']);
  });

  it('onLoggedOut 없이도 동작한다', async () => {
    state().login({ user: LANDLORD });
    api.postLogout.mockResolvedValue();
    await state().logout();
    expect(state().user).toBeNull();
  });

  it('서버 로그아웃이 실패하면 세션을 지우지 않고 오류를 전달한다 (로그아웃된 척하지 않는다)', async () => {
    state().login({ user: LANDLORD });
    const onLoggedOut = vi.fn();
    api.postLogout.mockRejectedValue(new Error('network'));
    await expect(state().logout(onLoggedOut)).rejects.toThrow('network');
    expect(state().user).toEqual(LANDLORD);
    expect(onLoggedOut).not.toHaveBeenCalled();
  });
});

describe('refreshMe: 인증 완료·만료가 바로 보이게 법정동 권한만 다시 읽는다', () => {
  it('성공하면 법정동 코드만 바꾸고 user 는 그대로', async () => {
    state().login({ user: LANDLORD, verifiedLegalDongCodes: [] });
    api.getMe.mockResolvedValue({ user: { ...LANDLORD, name: '바뀐 이름' }, verifiedLegalDongCodes: ['1168010100'] });
    await state().refreshMe();
    expect(state().verifiedLegalDongCodes).toEqual(['1168010100']);
    expect(state().user).toEqual(LANDLORD);
  });

  it('실패해도 현재 화면을 막지 않는다: 상태 유지, 예외 없음', async () => {
    state().login({ user: LANDLORD, verifiedLegalDongCodes: ['1171010100'] });
    api.getMe.mockRejectedValue(new Error('network'));
    await expect(state().refreshMe()).resolves.toBeUndefined();
    expect(state().verifiedLegalDongCodes).toEqual(['1171010100']);
    expect(state().user).toEqual(LANDLORD);
  });

  it('로그아웃된 뒤에 늦게 도착한 응답이 법정동 권한을 되살리지 않는다', async () => {
    state().login({ user: LANDLORD, verifiedLegalDongCodes: [] });
    let resolveMe;
    api.getMe.mockReturnValue(new Promise((resolve) => { resolveMe = resolve; }));
    const pending = state().refreshMe();
    state().clearSession();
    resolveMe({ user: LANDLORD, verifiedLegalDongCodes: ['1171010100'] });
    await pending;
    expect(state().user).toBeNull();
    expect(state().verifiedLegalDongCodes).toEqual([]);
  });
});
